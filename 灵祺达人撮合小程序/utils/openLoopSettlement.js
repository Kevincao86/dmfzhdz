/** 开环商单交片 / 未结算。与 web版/merchant-erp/src/lib/openLoopSettlement.ts 保持同一套日期间隔。 */

const CHECKIN_DAYS = [21, 35]
const SETTLE_DAYS = [30, 45, 60, 74, 88, 102, 116]
const ASK_FROM_DAY = 21
const ASK_STOP_DAY = 90

function isOpenLoopOrder(mp) {
  if (!mp) return false
  const top = String(mp.fulfillmentLoop || '').trim()
  if (top === 'open') return true
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : null
  return String((meta && meta.fulfillmentLoop) || '').trim() === 'open'
}

function parseOpenLoopMs(raw) {
  const s = String(raw || '').trim()
  if (!s) return 0
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const t = Date.parse(s)
    return Number.isFinite(t) ? t : 0
  }
  const m = s.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) {
    const clock = s.match(/(\d{1,2}):(\d{2})/)
    const dt = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      clock ? Number(clock[1]) : 0,
      clock ? Number(clock[2]) : 0,
      0,
      0,
    )
    return Number.isFinite(dt.getTime()) ? dt.getTime() : 0
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : 0
}

function startOfDay(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function daysSinceOpenLoop(raw, nowMs) {
  const ms = parseOpenLoopMs(raw)
  if (!ms) return 0
  return Math.floor((startOfDay(nowMs) - startOfDay(ms)) / 86400000)
}

function dateKeyOf(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function remindDate(anchorMs, plusDays) {
  const d = new Date(anchorMs)
  d.setHours(10, 0, 0, 0)
  d.setDate(d.getDate() + plusDays)
  return d
}

function amountSuffix(mp, applicant) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const quote = Number(String((applicant && applicant.quotePrice) || '').replace(/[^\d.]/g, ''))
  const fixed = Number(String(meta.fixedPrice || '').replace(/[^\d.]/g, ''))
  const n = quote > 0 ? quote : fixed
  if (!Number.isFinite(n) || n <= 0) return ''
  const text = n % 1 === 0 ? String(n) : n.toFixed(2)
  return ` · 预计 ¥${text}`
}

function anchorRaw(applicant, notified) {
  const stamped = String((applicant && applicant.selectionNotifiedAt) || '').trim()
  if (stamped) return stamped
  if (notified) return String((applicant && applicant.appliedAt) || '').trim()
  return ''
}

function reminderPrefix(mpOrderId, applicantId) {
  return `ol-${String(mpOrderId || '')}-${String(applicantId || '')}-`.replace(/[^A-Za-z0-9_-]/g, '')
}

function eventId(mpOrderId, applicantId, tag) {
  return `${reminderPrefix(mpOrderId, applicantId)}${tag}`.slice(0, 96)
}

function resolveOpenLoopCard(mp, applicant, opts) {
  const options = opts || {}
  if (!isOpenLoopOrder(mp) || !applicant) return null
  if (options.enabled !== true) return null
  if (String(applicant.taskStatus || '') === 'rejected') return null
  const selected = !!(options.selected || options.selectionNotified)
  if (!selected) return null

  const nowMs = options.nowMs && Number.isFinite(options.nowMs) ? options.nowMs : Date.now()
  const notified = !!options.selectionNotified
  const status = String(applicant.openLoopSettlementStatus || '').trim()
  const deliveredAt = String(applicant.openLoopDeliveredAt || '').trim()
  const amount = amountSuffix(mp, applicant)

  if (status === 'dropped') {
    return {
      phase: 'dropped',
      label: '未做成',
      tone: 'cancelled',
      tabId: 'cancelled',
      hint: '这笔开环单已标记没做成',
      showDelivered: true,
      showAsk: false,
      showSettled: false,
      showSnooze: false,
      showGroupQr: false,
    }
  }
  if (status === 'settled') {
    return {
      phase: 'settled',
      label: '已结算',
      tone: 'completed',
      tabId: 'completed',
      hint: `已标记收到款项${amount}`,
      showDelivered: false,
      showAsk: false,
      showSettled: false,
      showSnooze: false,
      showGroupQr: false,
    }
  }
  if (deliveredAt) {
    const days = Math.max(0, daysSinceOpenLoop(deliveredAt, nowMs))
    const muted = applicant.openLoopRemindMuted === true
    return {
      phase: 'pending',
      label: '待结算',
      tone: 'accepted',
      tabId: 'completed',
      hint: muted
        ? `待结算 · 交片已过 ${days} 天${amount} · 已暂停提醒`
        : `待结算 · 交片已过 ${days} 天${amount}`,
      showDelivered: false,
      showAsk: false,
      showSettled: true,
      showSnooze: !muted,
      showGroupQr: true,
    }
  }

  const anchor = anchorRaw(applicant, notified)
  const days = anchor ? Math.max(0, daysSinceOpenLoop(anchor, nowMs)) : 0
  const snoozeMs = parseOpenLoopMs(applicant.openLoopSnoozeUntil)
  const snoozed = snoozeMs > nowMs
  const closed = applicant.openLoopCheckinClosed === true || (!!anchor && days >= ASK_STOP_DAY)
  const ask = !!anchor && days >= ASK_FROM_DAY && !snoozed && !closed
  let hint = '审核已通过。进群交付后，点「我已交片」再开始记结算。'
  if (closed) hint = '已超过 90 天未确认交片，不再自动追问。交了片仍可点「我已交片」。'
  else if (snoozed) hint = '已选择还在做，稍后再问。交了片可以点「我已交片」。'
  else if (ask) hint = `进群已 ${days} 天，这笔开环单交片了吗？`
  else if (anchor) hint = `群内进行中 · 进群 ${days} 天。交片后再记结算。`

  return {
    phase: 'in_group',
    label: '群内进行中',
    tone: 'accepted',
    tabId: 'approved',
    hint,
    showDelivered: true,
    showAsk: ask,
    showSettled: false,
    showSnooze: false,
    showGroupQr: true,
  }
}

function planOpenLoopReminders(mp, applicant, opts) {
  const options = opts || {}
  const card = resolveOpenLoopCard(mp, applicant, options)
  if (!card || !applicant) return null
  const mpOrderId = String((mp && mp.id) || applicant.mpOrderId || '').trim()
  const applicantId = String(applicant.id || '').trim()
  if (!mpOrderId || !applicantId) return null
  const nowMs = options.nowMs && Number.isFinite(options.nowMs) ? options.nowMs : Date.now()
  const prefix = reminderPrefix(mpOrderId, applicantId)

  if (card.phase === 'in_group' && applicant.openLoopCheckinArmed !== true) {
    const anchor = anchorRaw(applicant, !!options.selectionNotified)
    const anchorMs = parseOpenLoopMs(anchor)
    const drafts = []
    if (anchorMs) {
      CHECKIN_DAYS.forEach((day) => {
        const at = remindDate(anchorMs, day)
        if (at.getTime() <= nowMs + 60000) return
        if (daysSinceOpenLoop(anchor, at.getTime()) >= ASK_STOP_DAY) return
        drafts.push({
          eventId: eventId(mpOrderId, applicantId, `c${day}`),
          eventKind: 'open_loop_checkin',
          eventDateKey: dateKeyOf(at),
          eventTitle: day === 21 ? '请确认开环单是否交片' : '开环单仍未确认交片',
          remindAt: at.toISOString(),
        })
      })
    }
    return { arm: 'arm_checkin', drafts, cancelPrefix: prefix }
  }

  if (card.phase === 'pending' && applicant.openLoopRemindMuted !== true && applicant.openLoopSettleArmed !== true) {
    const deliveredMs = parseOpenLoopMs(applicant.openLoopDeliveredAt)
    const drafts = []
    if (deliveredMs) {
      SETTLE_DAYS.forEach((day) => {
        const at = remindDate(deliveredMs, day)
        if (at.getTime() <= nowMs + 60000) return
        drafts.push({
          eventId: eventId(mpOrderId, applicantId, `s${day}`),
          eventKind: 'open_loop_settle',
          eventDateKey: dateKeyOf(at),
          eventTitle: '开环商单还未结算',
          remindAt: at.toISOString(),
        })
      })
    }
    return { arm: 'arm_settle', drafts, cancelPrefix: prefix }
  }
  return null
}

function readSettleRemindMemberId() {
  let memberId = ''
  let localOn = false
  try {
    const auth = require('./auth.js')
    const account = auth.readAccount()
    memberId = String((account && account.registryMemberId) || '').trim()
  } catch (e) {
    memberId = ''
  }
  try {
    const member = require('./talentMember.js').readMember()
    if (!memberId) memberId = String((member && member.id) || '').trim()
    localOn = !!(member && member.openLoopSettleRemind)
  } catch (e) {
    localOn = false
  }
  return { memberId, localOn }
}

function settleRemindStorageKey(memberId) {
  return `meoo_open_loop_settle_remind_v1:${memberId || 'self'}`
}

function readSettleRemindOn(reg) {
  const who = readSettleRemindMemberId()
  const list = reg && Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  if (who.memberId) {
    const row = list.find((m) => m && String(m.id) === who.memberId)
    if (row && typeof row.openLoopSettleRemind === 'boolean') return row.openLoopSettleRemind
  }
  try {
    const cached = wx.getStorageSync(settleRemindStorageKey(who.memberId))
    if (cached === '1' || cached === '0') return cached === '1'
  } catch (e) {
    /* ignore */
  }
  return who.localOn
}

function rememberSettleRemindOn(enabled) {
  const who = readSettleRemindMemberId()
  try {
    wx.setStorageSync(settleRemindStorageKey(who.memberId), enabled ? '1' : '0')
  } catch (e) {
    /* ignore */
  }
}

module.exports = {
  isOpenLoopOrder,
  parseOpenLoopMs,
  daysSinceOpenLoop,
  reminderPrefix,
  resolveOpenLoopCard,
  planOpenLoopReminders,
  readSettleRemindMemberId,
  readSettleRemindOn,
  rememberSettleRemindOn,
}
