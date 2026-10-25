/**
 * 开环商单：进群后先记「群内进行中」，达人点「我已交片」才开始未结算提醒。
 * 闭环单不走这里。
 */
import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
} from './opsRegistryTypes.js'

export type OpenLoopPhase = 'in_group' | 'pending' | 'settled' | 'dropped'

export type OpenLoopCard = {
  phase: OpenLoopPhase
  label: string
  tone: 'accepted' | 'completed' | 'cancelled'
  tabId: 'approved' | 'completed' | 'cancelled'
  hint: string
  showDelivered: boolean
  showAsk: boolean
  showSettled: boolean
  showSnooze: boolean
  showGroupQr: boolean
}

export type OpenLoopReminderDraft = {
  eventId: string
  eventKind: 'open_loop_checkin' | 'open_loop_settle'
  eventDateKey: string
  eventTitle: string
  remindAt: string
}

export type OpenLoopReminderPlan = {
  arm: 'arm_checkin' | 'arm_settle'
  drafts: OpenLoopReminderDraft[]
  cancelPrefix: string
}

const CHECKIN_DAYS = [21, 35]
const SETTLE_DAYS = [30, 45, 60, 74, 88, 102, 116]
const ASK_FROM_DAY = 21
const ASK_STOP_DAY = 90
const SNOOZE_DAYS = 14

type ApplicantLike = Record<string, unknown> | null | undefined
type OrderLike = Record<string, unknown> | null | undefined

export function isOpenLoopOrder(mp: OrderLike): boolean {
  if (!mp) return false
  const top = String(mp.fulfillmentLoop || '').trim()
  if (top === 'open') return true
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? (mp.mpPublishMeta as Record<string, unknown>) : null
  return String(meta?.fulfillmentLoop || '').trim() === 'open'
}

export function parseOpenLoopMs(raw: unknown): number {
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

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function daysSinceOpenLoop(raw: unknown, nowMs: number): number {
  const ms = parseOpenLoopMs(raw)
  if (!ms) return 0
  return Math.floor((startOfDay(nowMs) - startOfDay(ms)) / 86400000)
}

function dateKeyOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function remindDate(anchorMs: number, plusDays: number): Date {
  const d = new Date(anchorMs)
  d.setHours(10, 0, 0, 0)
  d.setDate(d.getDate() + plusDays)
  return d
}

function amountSuffix(mp: OrderLike, applicant: ApplicantLike): string {
  const meta =
    mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const quote = Number(String(applicant?.quotePrice || '').replace(/[^\d.]/g, ''))
  const fixed = Number(String(meta.fixedPrice || '').replace(/[^\d.]/g, ''))
  const n = quote > 0 ? quote : fixed
  if (!Number.isFinite(n) || n <= 0) return ''
  const text = n % 1 === 0 ? String(n) : n.toFixed(2)
  return ` · 预计 ¥${text}`
}

function anchorRaw(applicant: ApplicantLike, notified: boolean): string {
  const stamped = String(applicant?.selectionNotifiedAt || '').trim()
  if (stamped) return stamped
  if (notified) return String(applicant?.appliedAt || '').trim()
  return ''
}

export function reminderPrefix(mpOrderId: string, applicantId: string): string {
  return `ol-${String(mpOrderId || '')}-${String(applicantId || '')}-`.replace(/[^A-Za-z0-9_-]/g, '')
}

function eventId(mpOrderId: string, applicantId: string, tag: string): string {
  return `${reminderPrefix(mpOrderId, applicantId)}${tag}`.slice(0, 96)
}

export function resolveOpenLoopCard(
  mp: OrderLike,
  applicant: ApplicantLike,
  opts?: { selected?: boolean; selectionNotified?: boolean; nowMs?: number; enabled?: boolean },
): OpenLoopCard | null {
  if (!isOpenLoopOrder(mp) || !applicant) return null
  if (String(applicant.taskStatus || '') === 'rejected') return null
  const selected = !!(opts?.selected || opts?.selectionNotified)
  if (!selected) return null

  const nowMs = opts?.nowMs && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now()
  const notified = !!opts?.selectionNotified
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

export function planOpenLoopReminders(
  mp: OrderLike,
  applicant: ApplicantLike,
  opts?: { selected?: boolean; selectionNotified?: boolean; nowMs?: number; enabled?: boolean },
): OpenLoopReminderPlan | null {
  const card = resolveOpenLoopCard(mp, applicant, opts)
  if (!card || !applicant) return null
  const mpOrderId = String(mp?.id || applicant.mpOrderId || '').trim()
  const applicantId = String(applicant.id || '').trim()
  if (!mpOrderId || !applicantId) return null
  const nowMs = opts?.nowMs && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now()
  const prefix = reminderPrefix(mpOrderId, applicantId)
  const storeTitle = String(mp?.title || mp?.customerName || '开环商单').trim() || '开环商单'

  if (card.phase === 'in_group' && applicant.openLoopCheckinArmed !== true) {
    const anchor = anchorRaw(applicant, !!opts?.selectionNotified)
    const anchorMs = parseOpenLoopMs(anchor)
    const drafts: OpenLoopReminderDraft[] = []
    if (anchorMs) {
      for (const day of CHECKIN_DAYS) {
        const at = remindDate(anchorMs, day)
        if (at.getTime() <= nowMs + 60_000) continue
        if (daysSinceOpenLoop(anchor, at.getTime()) >= ASK_STOP_DAY) continue
        drafts.push({
          eventId: eventId(mpOrderId, applicantId, `c${day}`),
          eventKind: 'open_loop_checkin',
          eventDateKey: dateKeyOf(at),
          eventTitle: day === 21 ? '请确认开环单是否交片' : '开环单仍未确认交片',
          remindAt: at.toISOString(),
        })
      }
    }
    return { arm: 'arm_checkin', drafts, cancelPrefix: prefix }
  }

  if (card.phase === 'pending' && applicant.openLoopRemindMuted !== true && applicant.openLoopSettleArmed !== true) {
    const deliveredMs = parseOpenLoopMs(applicant.openLoopDeliveredAt)
    const drafts: OpenLoopReminderDraft[] = []
    if (deliveredMs) {
      for (const day of SETTLE_DAYS) {
        const at = remindDate(deliveredMs, day)
        if (at.getTime() <= nowMs + 60_000) continue
        drafts.push({
          eventId: eventId(mpOrderId, applicantId, `s${day}`),
          eventKind: 'open_loop_settle',
          eventDateKey: dateKeyOf(at),
          eventTitle: storeTitle ? '开环商单还未结算' : '开环商单还未结算',
          remindAt: at.toISOString(),
        })
      }
    }
    return { arm: 'arm_settle', drafts, cancelPrefix: prefix }
  }

  return null
}

export type OrderSettlePreset = '7' | '15' | '30' | 'custom'

export function orderSettleDateKey(plusDays: number, now = new Date()): string {
  const days = Number.isFinite(plusDays) ? Math.trunc(plusDays) : 0
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12, 0, 0, 0)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function settlementDateKeyForPreset(preset: '7' | '15' | '30', now = new Date()): string {
  const days = preset === '15' ? 15 : preset === '30' ? 30 : 7
  return orderSettleDateKey(days, now)
}

export function orderSettleMonthDay(dateKey: string): string {
  const m = String(dateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${Number(m[2])}月${Number(m[3])}日`
}

export function orderSettleRemindAtIso(dateKey: string, timeLabel: string): string {
  const d = String(dateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const t = String(timeLabel || '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!d || !t) return ''
  const dt = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0)
  if (!Number.isFinite(dt.getTime())) return ''
  return dt.toISOString()
}

function clearedOrderSettleRemind(): Pick<
  RegistryMpRecruitmentApplicant,
  | 'orderSettleRemindOn'
  | 'orderSettleRemindPreset'
  | 'orderSettleRemindDate'
  | 'orderSettleRemindTime'
  | 'orderSettleCalendarEventId'
> {
  return {
    orderSettleRemindOn: false,
    orderSettleRemindPreset: '',
    orderSettleRemindDate: '',
    orderSettleRemindTime: '',
    orderSettleCalendarEventId: '',
  }
}

const ORDER_SETTLE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const ORDER_SETTLE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const ORDER_SETTLE_EVENT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function applyOrderSettleRemind(
  order: RegistryMpRecruitmentOrder,
  input: {
    applicantId?: string
    enabled?: boolean
    preset?: string
    dateKey?: string
    timeLabel?: string
    calendarEventId?: string
  },
  now: Date,
): { ok: true; order: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const aid = String(input?.applicantId || '').trim()
  if (!aid) return { ok: false, error: 'invalid_order_settle' }
  const nowText = now.toLocaleString('zh-CN', { hour12: false })
  if (input?.enabled !== true) {
    return patchApplicant(order, aid, nowText, (row) => ({ ...row, ...clearedOrderSettleRemind() }))
  }
  const presetRaw = String(input.preset || '').trim()
  const preset: OrderSettlePreset | '' =
    presetRaw === '7' || presetRaw === '15' || presetRaw === '30' || presetRaw === 'custom' ? presetRaw : ''
  if (!preset) return { ok: false, error: 'invalid_order_settle' }
  const dateKey = String(input.dateKey || '').trim()
  const dm = dateKey.match(ORDER_SETTLE_DATE_RE)
  if (!dm) return { ok: false, error: 'invalid_order_settle' }
  const parsed = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]))
  if (
    parsed.getFullYear() !== Number(dm[1]) ||
    parsed.getMonth() !== Number(dm[2]) - 1 ||
    parsed.getDate() !== Number(dm[3])
  ) {
    return { ok: false, error: 'invalid_order_settle' }
  }
  const timeLabel = String(input.timeLabel || '10:00').trim()
  if (!ORDER_SETTLE_TIME_RE.test(timeLabel)) return { ok: false, error: 'invalid_order_settle' }
  const eventId = String(input.calendarEventId || '').trim()
  if (eventId && !ORDER_SETTLE_EVENT_RE.test(eventId)) return { ok: false, error: 'invalid_order_settle' }
  return patchApplicant(order, aid, nowText, (row) => ({
    ...row,
    orderSettleRemindOn: true,
    orderSettleRemindPreset: preset,
    orderSettleRemindDate: dateKey,
    orderSettleRemindTime: timeLabel,
    orderSettleCalendarEventId: eventId,
  }))
}

function patchApplicant(
  order: RegistryMpRecruitmentOrder,
  applicantId: string,
  now: string,
  map: (row: RegistryMpRecruitmentApplicant) => RegistryMpRecruitmentApplicant,
): { ok: true; order: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const applicants = [...(order.applicants ?? [])]
  const idx = applicants.findIndex((a) => a && String(a.id) === applicantId)
  if (idx < 0) return { ok: false, error: 'applicant_not_found' }
  applicants[idx] = map(applicants[idx]!)
  return { ok: true, order: { ...order, applicants, updatedAt: now } }
}

export function setOpenLoopSettleRemind(
  data: { mpTalentMembers?: RegistryMpTalentMember[] },
  memberId: string,
  enabled: boolean,
): { ok: true } | { ok: false; error: string; status: number } {
  const id = String(memberId || '').trim()
  if (!id) return { ok: false, error: 'invalid_member', status: 400 }
  const list = data.mpTalentMembers ?? []
  const idx = list.findIndex((m) => m && String(m.id) === id)
  if (idx < 0) return { ok: false, error: 'member_not_found', status: 404 }
  list[idx] = { ...list[idx]!, openLoopSettleRemind: enabled === true }
  data.mpTalentMembers = list
  return { ok: true }
}

export function stampOpenLoopNotifiedAt(
  applicant: RegistryMpRecruitmentApplicant,
  order: RegistryMpRecruitmentOrder,
  now: string,
): RegistryMpRecruitmentApplicant {
  if (!isOpenLoopOrder(order as unknown as OrderLike)) return applicant
  if (String(applicant.selectionNotifiedAt || '').trim()) return applicant
  return { ...applicant, selectionNotifiedAt: now }
}

export function applyOpenLoopSettleAction(
  order: RegistryMpRecruitmentOrder,
  applicantId: string,
  action: string,
  now: Date,
): { ok: true; order: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const aid = String(applicantId || '').trim()
  const act = String(action || '').trim()
  if (!aid || !act) return { ok: false, error: 'invalid_open_loop' }
  if (
    act !== 'arm_checkin' &&
    act !== 'arm_settle' &&
    act !== 'delivered' &&
    act !== 'still_working' &&
    act !== 'dropped' &&
    act !== 'settled' &&
    act !== 'mute'
  ) {
    return { ok: false, error: 'invalid_open_loop' }
  }
  if (!isOpenLoopOrder(order as unknown as OrderLike)) return { ok: false, error: 'not_open_loop' }
  const nowText = now.toLocaleString('zh-CN', { hour12: false })
  const iso = now.toISOString()

  return patchApplicant(order, aid, nowText, (row) => {
    const status = String(row.openLoopSettlementStatus || '').trim()
    if (act === 'arm_checkin') return { ...row, openLoopCheckinArmed: true }
    if (act === 'arm_settle') return { ...row, openLoopSettleArmed: true }
    if (act === 'delivered') {
      if (status === 'settled') return row
      return {
        ...row,
        openLoopDeliveredAt: String(row.openLoopDeliveredAt || '').trim() || iso,
        openLoopSettlementStatus: 'pending',
        openLoopCheckinClosed: false,
        openLoopSnoozeUntil: '',
        openLoopSettleArmed: false,
      }
    }
    if (act === 'still_working') {
      if (status === 'settled' || String(row.openLoopDeliveredAt || '').trim()) return row
      const anchor = anchorRaw(row as unknown as ApplicantLike, true)
      const days = anchor ? daysSinceOpenLoop(anchor, now.getTime()) : 0
      if (days >= ASK_STOP_DAY) return { ...row, openLoopCheckinClosed: true }
      const until = new Date(now.getTime() + SNOOZE_DAYS * 86400000)
      const closed = days + SNOOZE_DAYS >= ASK_STOP_DAY
      return {
        ...row,
        openLoopSnoozeUntil: until.toISOString(),
        openLoopCheckinClosed: closed,
      }
    }
    if (act === 'dropped') {
      if (status === 'settled') return row
      return {
        ...row,
        openLoopSettlementStatus: 'dropped',
        openLoopCheckinClosed: true,
        ...clearedOrderSettleRemind(),
      }
    }
    if (act === 'settled') {
      if (!String(row.openLoopDeliveredAt || '').trim()) return row
      return {
        ...row,
        openLoopSettlementStatus: 'settled',
        openLoopSettledAt: iso,
        openLoopRemindMuted: true,
        ...clearedOrderSettleRemind(),
      }
    }
    if (act === 'mute') {
      if (!String(row.openLoopDeliveredAt || '').trim()) return row
      return { ...row, openLoopRemindMuted: true }
    }
    return row
  })
}
