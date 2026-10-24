import { planOpenLoopReminders, reminderPrefix } from '@merchant/lib/openLoopSettlement'
import { cancelCalendarReminder, createCalendarReminder, listCalendarReminders } from './mpCalendarReminderApi'
import { patchMpRecruitmentOrder } from '../mpApi'

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
  const plan = planOpenLoopReminders(mp, applicant, { selected: true, selectionNotified })
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

export async function submitOpenLoopAction(mpOrderId: string, applicantId: string, action: string): Promise<void> {
  const id = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!id || !aid || !action) throw new Error('订单信息缺失')
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
