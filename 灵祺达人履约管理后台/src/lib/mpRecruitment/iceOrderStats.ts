import { isIceMpOrder } from './orderCard'

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
  return !ts && !!String(applicant.appliedAt || '').trim()
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
