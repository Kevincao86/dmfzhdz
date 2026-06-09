import { isIceMpOrder } from './iceOrderDetect.js'

export type TalentAppProgressId = 'all' | 'pr_pending' | 'in_progress' | 'completed'

export const TALENT_APP_PROGRESS_FILTERS: { id: TalentAppProgressId; label: string }[] = [
  { id: 'all', label: '全部状态' },
  { id: 'pr_pending', label: 'PR 待选中' },
  { id: 'in_progress', label: '进行中' },
  { id: 'completed', label: '已完成' },
]

function isApplicantPassed(applicant: Record<string, unknown>): boolean {
  if (applicant.aiVerifyStatus === 'passed') return true
  if (applicant.videoStatus === 'passed') return true
  if (String(applicant.completedAt || '').trim()) return true
  return false
}

function isApplicantPrSelected(mp: Record<string, unknown> | null, applicant: Record<string, unknown>): boolean {
  if (applicant.prSelected === true || applicant.merchantSelected === true) return true
  const ids = Array.isArray(mp?.selectedApplicantIds) ? (mp!.selectedApplicantIds as unknown[]) : []
  if (ids.map(String).includes(String(applicant.id || ''))) return true
  return false
}

function resolveIceContext(mp: Record<string, unknown> | null, mpOrderId?: string): boolean {
  if (isIceMpOrder(mp)) return true
  const orderId = String(mpOrderId || mp?.id || '').trim()
  return /^MP-ICE-/i.test(orderId)
}

export function resolveTalentApplicationProgress(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  mpOrderId?: string,
): { id: Exclude<TalentAppProgressId, 'all'>; label: string } {
  const ice = resolveIceContext(mp, mpOrderId)
  if (!applicant) {
    if (ice) return { id: 'in_progress', label: '进行中' }
    return { id: 'pr_pending', label: 'PR 待选中' }
  }

  if (ice) {
    const taskStatus = String(applicant.taskStatus || '')
    if (isApplicantPassed(applicant) && taskStatus === 'confirmed') {
      return { id: 'completed', label: '已完成' }
    }
    if (taskStatus === 'pending_confirm' || (!taskStatus && !applicant.assignedVideoDownloadUrl)) {
      return { id: 'in_progress', label: '待确认接收' }
    }
    if (taskStatus === 'confirmed') {
      const link = String(applicant.douyinPublishUrl || '').trim()
      const pendingReview =
        applicant.aiVerifyStatus === 'pending' ||
        applicant.videoStatus === 'pending' ||
        (link && applicant.aiVerifyStatus !== 'passed' && applicant.videoStatus !== 'passed')
      if (pendingReview) return { id: 'in_progress', label: '进行中' }
      if (!link) return { id: 'in_progress', label: '待回传链接' }
    }
    if (taskStatus === 'rejected') return { id: 'in_progress', label: '已拒绝' }
    return { id: 'in_progress', label: '进行中' }
  }

  if (isApplicantPassed(applicant)) return { id: 'completed', label: '已完成' }
  if (!isApplicantPrSelected(mp, applicant)) return { id: 'pr_pending', label: 'PR 待选中' }
  return { id: 'in_progress', label: '进行中' }
}

export function matchTalentApplicationProgress(
  progressId: TalentAppProgressId,
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  mpOrderId?: string,
): boolean {
  if (progressId === 'all') return true
  return resolveTalentApplicationProgress(mp, applicant, mpOrderId).id === progressId
}
