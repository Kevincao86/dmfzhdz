import { orderSettleRemindAtIso, planOpenLoopReminders, reminderPrefix } from '@merchant/lib/openLoopSettlement'
import { cancelCalendarReminder, createCalendarReminder, listCalendarReminders } from '../mpCalendarReminderApi'
import { deleteCalendarCustomEvent, listCalendarCustomEvents, saveCalendarCustomEvent } from '../mpCalendarCustomEventApi'
import { clearMpRegistryCache, patchMpRecruitmentOrder } from '../mpApi'

const inflight = new Set<string>()

function storeNameOf(mp: Record<string, unknown> | null | undefined): string {
  return String(mp?.storeName || mp?.title || mp?.customerName || '开环商单').trim() || '开环商单'
}

export async function cancelOpenLoopReminders(mpOrderId: string, applicantId: string): Promise<void> {
  const prefix = reminderPrefix(mpOrderId, applicantId)
  if (!prefix) return
  const rows = await listCalendarReminders()
  const pending = rows.filter((row) => row.status === 'pending' && row.eventId.startsWith(prefix))
  for (const row of pending) {
    if (!row.id) continue
    try {
      await cancelCalendarReminder(row.id)
    } catch {
      /* 已发出或已取消 */
    }
  }
}

export async function syncOpenLoopReminder(
  mp: Record<string, unknown> | null | undefined,
  applicant: Record<string, unknown> | null | undefined,
  selectionNotified: boolean,
): Promise<void> {
  if (!mp || !applicant) return
  const applicantId = String(applicant.id || '').trim()
  const mpOrderId = String(mp.id || '').trim()
  if (!applicantId || !mpOrderId) return
  const key = `${mpOrderId}:${applicantId}`
  if (inflight.has(key)) return
  const plan = planOpenLoopReminders(mp, applicant, { selected: true, selectionNotified, enabled: true })
  if (!plan) return
  inflight.add(key)
  try {
    const existing = await listCalendarReminders()
    const have = new Set(existing.map((row) => row.eventId))
    const storeName = storeNameOf(mp)
    for (const draft of plan.drafts) {
      if (have.has(draft.eventId)) continue
      await createCalendarReminder({
        eventId: draft.eventId,
        mpOrderId,
        eventKind: draft.eventKind,
        eventDateKey: draft.eventDateKey,
        eventTitle: draft.eventTitle,
        storeName,
        leadPreset: 'at',
        remindAt: draft.remindAt,
        channels: ['oa'],
      })
    }
    await patchMpRecruitmentOrder({
      id: mpOrderId,
      openLoopSettle: { applicantId, action: plan.arm },
    })
    if (plan.arm === 'arm_checkin') applicant.openLoopCheckinArmed = true
    if (plan.arm === 'arm_settle') applicant.openLoopSettleArmed = true
  } catch {
    /* 下次打开再试 */
  } finally {
    inflight.delete(key)
  }
}

export async function cancelAllOpenLoopReminders(): Promise<void> {
  const rows = await listCalendarReminders()
  const pending = rows.filter(
    (row) =>
      row.status === 'pending' &&
      (row.eventKind === 'open_loop_checkin' || row.eventKind === 'open_loop_settle'),
  )
  for (const row of pending) {
    if (!row.id) continue
    try {
      await cancelCalendarReminder(row.id)
    } catch {
      /* 已取消 */
    }
  }
}

const SETTLE_REMIND_KEY = 'meoo_open_loop_settle_remind_v1'

export function readSettleRemindOn(
  reg: { mpTalentMembers?: Array<Record<string, unknown>> } | null | undefined,
  memberId: string,
): boolean {
  const id = String(memberId || '').trim()
  const list = Array.isArray(reg?.mpTalentMembers) ? reg!.mpTalentMembers! : []
  if (id) {
    const row = list.find((m) => m && String(m.id || '') === id)
    if (row && typeof row.openLoopSettleRemind === 'boolean') return row.openLoopSettleRemind
  }
  try {
    const cached = localStorage.getItem(`${SETTLE_REMIND_KEY}:${id || 'self'}`)
    if (cached === '1' || cached === '0') return cached === '1'
  } catch {
    /* ignore */
  }
  return false
}

export function rememberSettleRemindOn(memberId: string, enabled: boolean): void {
  try {
    localStorage.setItem(`${SETTLE_REMIND_KEY}:${memberId || 'self'}`, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export async function setSettleRemind(memberId: string, enabled: boolean): Promise<void> {
  const id = String(memberId || '').trim()
  if (!id) throw new Error('请先完善达人资料')
  const previous = readSettleRemindOn(null, id)
  rememberSettleRemindOn(id, enabled)
  try {
    await patchMpRecruitmentOrder({ settleRemind: { memberId: id, enabled } })
  } catch (err) {
    rememberSettleRemindOn(id, previous)
    throw err
  }
  clearMpRegistryCache()
  if (!enabled) {
    try {
      await cancelAllOpenLoopReminders()
    } catch {
      /* 开关已关 */
    }
  }
}

function settleNote(mpOrderId: string, applicantId: string): string {
  return `order-settle|${mpOrderId}|${applicantId}`.slice(0, 200)
}

function settleTitle(mp: Record<string, unknown> | null | undefined): string {
  return `结算日 · ${storeNameOf(mp)}`.slice(0, 40)
}

async function cancelRemindersForEvents(eventIds: string[]): Promise<void> {
  const ids = new Set(eventIds.map((id) => String(id || '').trim()).filter(Boolean))
  if (!ids.size) return
  const rows = await listCalendarReminders()
  const pending = rows.filter((row) => row.status === 'pending' && ids.has(row.eventId))
  for (const row of pending) {
    if (!row.id) continue
    try {
      await cancelCalendarReminder(row.id)
    } catch {
      /* 已发出或已取消 */
    }
  }
}

export async function removeOrderSettleCalendar(mpOrderId: string, applicantId: string): Promise<void> {
  const note = settleNote(mpOrderId, applicantId)
  const events = await listCalendarCustomEvents()
  const hit = events.filter((row) => row.note === note)
  await cancelRemindersForEvents(hit.map((row) => row.id))
  for (const row of hit) {
    try {
      await deleteCalendarCustomEvent(row.id)
    } catch {
      /* 已删除 */
    }
  }
}

export async function saveOrderSettleRemind(
  mp: Record<string, unknown>,
  applicant: Record<string, unknown>,
  input: { enabled: boolean; preset?: string; dateKey?: string; timeLabel?: string },
): Promise<void> {
  const mpOrderId = String(mp?.id || '').trim()
  const applicantId = String(applicant?.id || '').trim()
  if (!mpOrderId || !applicantId) throw new Error('订单信息缺失')
  const enabled = input.enabled === true
  if (!enabled) {
    await removeOrderSettleCalendar(mpOrderId, applicantId)
    await patchMpRecruitmentOrder({
      id: mpOrderId,
      orderSettleRemind: { applicantId, enabled: false },
    })
    clearMpRegistryCache()
    return
  }
  const preset = input.preset === '15' || input.preset === '30' || input.preset === 'custom' ? input.preset : '7'
  const dateKey = String(input.dateKey || '').trim()
  const timeLabel = String(input.timeLabel || '10:00').trim()
  const remindAt = orderSettleRemindAtIso(dateKey, timeLabel)
  if (!remindAt || Date.parse(remindAt) <= Date.now() + 60_000) throw new Error('结算时间要晚于现在')
  const title = settleTitle(mp)
  const note = settleNote(mpOrderId, applicantId)
  let eventId = String(applicant.orderSettleCalendarEventId || '').trim()
  if (eventId) {
    try {
      await saveCalendarCustomEvent({ id: eventId, title, eventDateKey: dateKey, timeLabel, note })
    } catch {
      eventId = ''
    }
  }
  if (!eventId) {
    eventId = await saveCalendarCustomEvent({ title, eventDateKey: dateKey, timeLabel, note })
  }
  if (!eventId) throw new Error('写入商单日历失败')
  const events = await listCalendarCustomEvents()
  const extras = events.filter((row) => row.note === note && row.id !== eventId).map((row) => row.id)
  await cancelRemindersForEvents([eventId, ...extras])
  for (const extraId of extras) {
    try {
      await deleteCalendarCustomEvent(extraId)
    } catch {
      /* 旧日程已不在 */
    }
  }
  await createCalendarReminder({
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
  await patchMpRecruitmentOrder({
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
  clearMpRegistryCache()
}

export async function submitOpenLoopAction(mpOrderId: string, applicantId: string, action: string): Promise<void> {
  const id = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!id || !aid || !action) throw new Error('订单信息缺失')
  if (action === 'settled' || action === 'dropped') {
    try {
      await removeOrderSettleCalendar(id, aid)
    } catch {
      /* 状态仍要记下 */
    }
  }
  await patchMpRecruitmentOrder({
    id,
    openLoopSettle: { applicantId: aid, action },
  })
  if (action === 'settled' || action === 'dropped' || action === 'mute') {
    try {
      await cancelOpenLoopReminders(id, aid)
    } catch {
      /* 状态已记下 */
    }
  }
}
