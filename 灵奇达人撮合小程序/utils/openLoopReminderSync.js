const openLoop = require('./openLoopSettlement.js')
const calReminder = require('./mpCalendarReminderApi.js')
const customEvent = require('./mpCalendarCustomEventApi.js')
const orderOps = require('./mpOrderRegistryOps.js')

const inflight = new Set()

function storeNameOf(mp) {
  return String((mp && (mp.storeName || mp.title || mp.customerName)) || '开环商单').trim() || '开环商单'
}

async function cancelPending(prefix) {
  if (!prefix) return
  const rows = await calReminder.listReminders()
  const pending = (rows || []).filter(
    (row) => row && row.status === 'pending' && String(row.eventId || '').indexOf(prefix) === 0,
  )
  for (let i = 0; i < pending.length; i++) {
    const id = String(pending[i].id || '').trim()
    if (!id) continue
    try {
      await calReminder.cancelReminder(id)
    } catch (e) {
      /* 已发出的或已取消的跳过 */
    }
  }
}

async function createMissing(drafts, mp) {
  const rows = await calReminder.listReminders()
  const have = new Set((rows || []).map((row) => String((row && row.eventId) || '')))
  const storeName = storeNameOf(mp)
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]
    if (!draft || have.has(draft.eventId)) continue
    await calReminder.createReminder({
      eventId: draft.eventId,
      mpOrderId: String((mp && mp.id) || ''),
      eventKind: draft.eventKind,
      eventDateKey: draft.eventDateKey,
      eventTitle: draft.eventTitle,
      storeName,
      leadPreset: 'at',
      remindAt: draft.remindAt,
      channels: ['oa'],
    })
  }
}

async function syncOne(mp, applicant, selectionNotified) {
  if (!mp || !applicant) return
  const applicantId = String(applicant.id || '').trim()
  const mpOrderId = String(mp.id || '').trim()
  if (!applicantId || !mpOrderId) return
  const key = `${mpOrderId}:${applicantId}`
  if (inflight.has(key)) return
  const plan = openLoop.planOpenLoopReminders(mp, applicant, {
    selected: true,
    selectionNotified: !!selectionNotified,
    enabled: true,
  })
  if (!plan) return
  inflight.add(key)
  try {
    await createMissing(plan.drafts, mp)
    await orderOps.patchMpRecruitmentOrder({
      id: mpOrderId,
      openLoopSettle: { applicantId, action: plan.arm },
    })
    if (plan.arm === 'arm_checkin') applicant.openLoopCheckinArmed = true
    if (plan.arm === 'arm_settle') applicant.openLoopSettleArmed = true
  } catch (e) {
    /* 下次打开再试，不打断报名列表 */
  } finally {
    inflight.delete(key)
  }
}

async function cancelAllOpenLoopReminders() {
  const rows = await calReminder.listReminders()
  const pending = (rows || []).filter((row) => {
    const kind = String((row && row.eventKind) || '')
    return row && row.status === 'pending' && (kind === 'open_loop_checkin' || kind === 'open_loop_settle')
  })
  for (let i = 0; i < pending.length; i++) {
    const id = String(pending[i].id || '').trim()
    if (!id) continue
    try {
      await calReminder.cancelReminder(id)
    } catch (e) {
      /* 已取消的跳过 */
    }
  }
}

async function postSettleRemind(memberId, enabled) {
  const api = require('./api.js')
  const auth = require('./auth.js')
  const paths = [
    '/api/meoo-ops-mp-recruitment-orders-patch',
    '/api/ops-sync/mp-recruitment-orders/patch',
  ]
  let lastErr
  for (let i = 0; i < paths.length; i++) {
    try {
      const data = await api.post(paths[i], { settleRemind: { memberId, enabled: enabled === true } }, auth.authHeaders())
      if (data && data.ok === false) throw new Error(String(data.detail || data.error || '保存失败'))
      return data
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('保存失败')
}

async function setSettleRemind(enabled) {
  const who = openLoop.readSettleRemindMemberId()
  if (!who.memberId) throw new Error('请先完善达人资料')
  const previous = openLoop.readSettleRemindOn(null)
  openLoop.rememberSettleRemindOn(enabled === true)
  try {
    await postSettleRemind(who.memberId, enabled === true)
  } catch (err) {
    openLoop.rememberSettleRemindOn(previous)
    throw err
  }
  try {
    require('./registryCache.js').bust()
  } catch (e) {
    /* ignore */
  }
  if (!enabled) {
    try {
      await cancelAllOpenLoopReminders()
    } catch (e) {
      /* 开关已关上，未发出的提醒下次再清 */
    }
  }
}

function syncRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  list.forEach((row) => {
    const card = row && row.openLoop
    if (!card || (card.phase !== 'in_group' && card.phase !== 'pending')) return
    void syncOne(row.progressMp, row.progressMe, row.selectionNotified)
  })
}

function settleNote(mpOrderId, applicantId) {
  return `order-settle|${mpOrderId}|${applicantId}`.slice(0, 200)
}

function settleTitle(mp) {
  return `结算日 · ${storeNameOf(mp)}`.slice(0, 40)
}

async function cancelRemindersForEvents(eventIds) {
  const ids = {}
  ;(eventIds || []).forEach((id) => {
    const key = String(id || '').trim()
    if (key) ids[key] = true
  })
  if (!Object.keys(ids).length) return
  const rows = await calReminder.listReminders()
  const pending = (rows || []).filter((row) => row && row.status === 'pending' && ids[String(row.eventId || '')])
  for (let i = 0; i < pending.length; i++) {
    const reminderId = String(pending[i].id || '').trim()
    if (!reminderId) continue
    try {
      await calReminder.cancelReminder(reminderId)
    } catch (e) {
      /* 已发出或已取消 */
    }
  }
}

async function removeOrderSettleCalendar(mpOrderId, applicantId) {
  const note = settleNote(mpOrderId, applicantId)
  const events = await customEvent.listEvents()
  const hit = (events || []).filter((row) => row && String(row.note || '') === note)
  await cancelRemindersForEvents(hit.map((row) => row.id))
  for (let i = 0; i < hit.length; i++) {
    const id = String(hit[i].id || '').trim()
    if (!id) continue
    try {
      await customEvent.deleteEvent(id)
    } catch (e) {
      /* 已删除 */
    }
  }
}

async function saveOrderSettleRemind(mp, applicant, input) {
  const mpOrderId = String((mp && mp.id) || '').trim()
  const applicantId = String((applicant && applicant.id) || '').trim()
  if (!mpOrderId || !applicantId) throw new Error('订单信息缺失')
  const enabled = !!(input && input.enabled)
  if (!enabled) {
    await removeOrderSettleCalendar(mpOrderId, applicantId)
    await orderOps.patchMpRecruitmentOrder({
      id: mpOrderId,
      orderSettleRemind: { applicantId, enabled: false },
    })
    try {
      require('./registryCache.js').bust()
    } catch (e) {
      /* ignore */
    }
    return
  }
  const presetRaw = String((input && input.preset) || '')
  const preset = presetRaw === '15' || presetRaw === '30' || presetRaw === 'custom' ? presetRaw : '7'
  const dateKey = String((input && input.dateKey) || '').trim()
  const timeLabel = String((input && input.timeLabel) || '10:00').trim()
  const remindAt = openLoop.orderSettleRemindAtIso(dateKey, timeLabel)
  if (!remindAt || Date.parse(remindAt) <= Date.now() + 60000) throw new Error('结算时间要晚于现在')
  const title = settleTitle(mp)
  const note = settleNote(mpOrderId, applicantId)
  let eventId = String((applicant && applicant.orderSettleCalendarEventId) || '').trim()
  if (eventId) {
    try {
      await customEvent.saveEvent({ id: eventId, title, eventDateKey: dateKey, timeLabel, note })
    } catch (e) {
      eventId = ''
    }
  }
  if (!eventId) {
    const saved = await customEvent.saveEvent({ title, eventDateKey: dateKey, timeLabel, note })
    const event = saved && saved.event ? saved.event : null
    eventId = String((event && event.id) || '').trim()
  }
  if (!eventId) throw new Error('写入商单日历失败')
  const events = await customEvent.listEvents()
  const extras = (events || []).filter((row) => row && String(row.note || '') === note && String(row.id || '') !== eventId)
  await cancelRemindersForEvents([eventId].concat(extras.map((row) => row.id)))
  for (let i = 0; i < extras.length; i++) {
    const extraId = String(extras[i].id || '').trim()
    if (!extraId) continue
    try {
      await customEvent.deleteEvent(extraId)
    } catch (e) {
      /* 旧日程已不在 */
    }
  }
  await calReminder.createReminder({
    eventId,
    mpOrderId,
    eventKind: 'order_settle',
    eventDateKey: dateKey,
    eventTitle: title,
    storeName: storeNameOf(mp),
    leadPreset: 'at',
    remindAt,
    channels: ['oa'],
  })
  await orderOps.patchMpRecruitmentOrder({
    id: mpOrderId,
    orderSettleRemind: {
      applicantId,
      enabled: true,
      preset,
      dateKey,
      timeLabel,
      calendarEventId: eventId,
    },
  })
  try {
    require('./registryCache.js').bust()
  } catch (e) {
    /* ignore */
  }
}

async function submitAction(mpOrderId, applicantId, action) {
  const id = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!id || !aid || !action) throw new Error('订单信息缺失')
  if (action === 'settled' || action === 'dropped') {
    try {
      await removeOrderSettleCalendar(id, aid)
    } catch (e) {
      /* 状态仍要记下 */
    }
  }
  await orderOps.patchMpRecruitmentOrder({
    id,
    openLoopSettle: { applicantId: aid, action },
  })
  if (action === 'settled' || action === 'dropped' || action === 'mute') {
    try {
      await cancelPending(openLoop.reminderPrefix(id, aid))
    } catch (e) {
      /* 状态已记下，提醒取消失败下次打开再清 */
    }
  }
}

module.exports = {
  syncRows,
  syncOne,
  submitAction,
  setSettleRemind,
  saveOrderSettleRemind,
}
