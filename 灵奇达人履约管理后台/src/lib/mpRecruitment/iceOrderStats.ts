import { isIceMpOrder } from './orderCard'
import { isPackSlotIceOrder } from '../mpSync/iceOrderDetect'
import { parseIceSlotTotalFromMp } from './listFilters'

export function getIceVerifyMode(mp: Record<string, unknown> | null | undefined): 'ai' | 'pr' {
  const meta =
    mp?.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  return String(meta.iceVerifyMode || meta.iceAuditMode || 'ai').trim().toLowerCase() === 'pr' ? 'pr' : 'ai'
}

export function isIceApplicantCompleted(applicant: Record<string, unknown> | null | undefined): boolean {
  if (!applicant) return false
  if (applicant.aiVerifyStatus === 'passed' || applicant.videoStatus === 'passed') return true
  return !!String(applicant.completedAt || '').trim()
}

export function isIceApplicantClaimed(applicant: Record<string, unknown> | null | undefined): boolean {
  if (!applicant || applicant.taskStatus === 'rejected') return false
  const ts = String(applicant.taskStatus || '')
  if (ts === 'pending_confirm' || ts === 'confirmed' || ts === 'applied') return true
  return !!String(applicant.appliedAt || '').trim()
}

export function countIceOrderStats(mp: Record<string, unknown> | null | undefined): { claimed: number; completed: number } {
  const applicants = Array.isArray(mp?.applicants) ? (mp!.applicants as Record<string, unknown>[]) : []
  let claimed = 0
  let completed = 0
  for (const a of applicants) {
    if (isIceApplicantCompleted(a)) {
      completed += 1
      claimed += 1
    } else if (isIceApplicantClaimed(a)) {
      claimed += 1
    }
  }
  return { claimed, completed }
}

function countEditIceAssignedSlots(mp: Record<string, unknown> | null | undefined): number {
  const slots = Array.isArray(mp?.iceVideoSlots)
    ? (mp!.iceVideoSlots as { assignedApplicantId?: string }[])
    : []
  return slots.filter((s) => String(s.assignedApplicantId || '').trim()).length
}

function countEditIceReservedSlots(mp: Record<string, unknown> | null | undefined): number {
  let reserved = 0
  const applicants = Array.isArray(mp?.applicants)
    ? (mp!.applicants as Record<string, unknown>[])
    : []
  for (const a of applicants) {
    if (!a || a.taskStatus === 'rejected') continue
    const ts = String(a.taskStatus || '')
    const assignedN = Array.isArray(a.assignedIceSlotIds) ? a.assignedIceSlotIds.length : 0
    if (assignedN > 0 || ts === 'confirmed') continue
    if ((ts === 'pending_confirm' || ts === 'applied' || !ts) && String(a.appliedAt || '').trim()) {
      reserved += Math.max(1, Number.parseInt(String(a.claimedSlotCount ?? 1), 10) || 1)
    }
  }
  return reserved
}

export function countIceClaimedSlots(
  mp: Record<string, unknown> | null | undefined,
  recruitCap: number,
): { claimed: number; total: number } {
  const total = parseIceSlotTotalFromMp(mp || {}) || Math.max(0, Number(recruitCap) || 0)
  if (!total) return { claimed: 0, total: 0 }

  if (isPackSlotIceOrder(mp)) {
    return {
      claimed: countEditIceAssignedSlots(mp) + countEditIceReservedSlots(mp),
      total,
    }
  }

  const slots = Array.isArray(mp?.iceVideoSlots)
    ? (mp!.iceVideoSlots as { assignedApplicantId?: string }[])
    : []
  const assigned = slots.filter((s) => String(s.assignedApplicantId || '').trim()).length
  if (assigned > 0) return { claimed: assigned, total }
  return { claimed: countIceOrderStats(mp).claimed, total }
}

export function buildSignupProgressLabel(
  mp: Record<string, unknown> | null | undefined,
  applicantCount: number,
  recruitCap: number,
  style: 'hall' | 'pr',
): string {
  const hall = style === 'hall'
  if (!isIceMpOrder(mp)) {
    const cap = recruitCap > 0 ? recruitCap : hall ? '不限' : '—'
    return hall ? `报名${applicantCount}/${cap}` : `报名 ${applicantCount}/${cap} 人`
  }
  const { claimed, total } = countIceClaimedSlots(mp, recruitCap)
  const capNum = total > 0 ? total : recruitCap > 0 ? recruitCap : 0
  const shown = capNum > 0 ? Math.min(claimed, capNum) : claimed
  const cap = capNum > 0 ? capNum : hall ? '不限' : '—'
  return hall ? `认领 ${shown}/${cap} 条` : `认领 ${shown}/${cap} 条`
}

export function isIceSlotsFull(
  mp: Record<string, unknown> | null | undefined,
  recruitCap: number,
): boolean {
  const { claimed, total } = countIceClaimedSlots(mp, recruitCap)
  const cap = total > 0 ? total : Math.max(0, Number(recruitCap) || 0)
  return cap > 0 && claimed >= cap
}

export function countRemainingIceSlots(
  mp: Record<string, unknown> | null | undefined,
  recruitCap: number,
): number {
  const { claimed, total } = countIceClaimedSlots(mp, recruitCap)
  const cap = total > 0 ? total : Math.max(0, Number(recruitCap) || 0)
  return Math.max(0, cap - Math.min(claimed, cap))
}

export function buildHallSignupCountText(
  mp: Record<string, unknown> | null | undefined,
  applicantCount: number,
  recruitCap: number,
): string {
  return buildSignupProgressLabel(mp, applicantCount, recruitCap, 'hall')
}

export function applicantTaskStatusLabel(applicant: Record<string, unknown> | null | undefined): string {
  if (!applicant) return '—'
  if (isIceApplicantCompleted(applicant)) return '已完成'
  if (applicant.taskStatus === 'rejected') return '已拒绝'
  if (applicant.videoStatus === 'rejected') return '链接已驳回'
  if (applicant.aiVerifyStatus === 'failed') return 'AI 核查未通过'
  if (applicant.videoStatus === 'pending' || applicant.aiVerifyStatus === 'pending') return '待审核链接'
  if (applicant.taskStatus === 'confirmed') return '进行中'
  if (applicant.taskStatus === 'pending_confirm' || applicant.taskStatus === 'applied') return '待确认接收'
  return '已认领'
}

export function canReviewIceLink(
  applicant: Record<string, unknown> | null | undefined,
  mp: Record<string, unknown> | null | undefined,
): boolean {
  if (!applicant || getIceVerifyMode(mp) !== 'pr') return false
  const url = String(applicant.douyinPublishUrl || applicant.videoUrl || '').trim()
  if (!url) return false
  if (isIceApplicantCompleted(applicant)) return false
  return applicant.videoStatus === 'pending' || applicant.aiVerifyStatus === 'pending'
}

export { isIceMpOrder }
