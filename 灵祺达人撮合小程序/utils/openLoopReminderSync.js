const openLoop = require('./openLoopSettlement.js')
const calReminder = require('./mpCalendarReminderApi.js')
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

function syncRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  list.forEach((row) => {
    const card = row && row.openLoop
    if (!card || (card.phase !== 'in_group' && card.phase !== 'pending')) return
    void syncOne(row.progressMp, row.progressMe, row.selectionNotified)
  })
}

async function submitAction(mpOrderId, applicantId, action) {
  const id = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!id || !aid || !action) throw new Error('订单信息缺失')
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
}
