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

export function resolveTalentApplicationProgress(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
): { id: Exclude<TalentAppProgressId, 'all'>; label: string } {
  if (!applicant) return { id: 'pr_pending', label: 'PR 待选中' }
  if (isApplicantPassed(applicant)) return { id: 'completed', label: '已完成' }

  const ice = isIceMpOrder(mp)
  if (ice) {
    const taskStatus = String(applicant.taskStatus || '')
    if (taskStatus === 'pending_confirm' || (!taskStatus && !applicant.assignedVideoDownloadUrl)) {
      return { id: 'in_progress', label: '进行中' }
    }
    if (taskStatus === 'confirmed') {
      const link = String(applicant.douyinPublishUrl || '').trim()
      const pendingReview =
        applicant.aiVerifyStatus === 'pending' ||
        applicant.videoStatus === 'pending' ||
        (link && applicant.aiVerifyStatus !== 'passed' && applicant.videoStatus !== 'passed')
      if (pendingReview) return { id: 'in_progress', label: '进行中' }
      if (!link) return { id: 'in_progress', label: '进行中' }
    }
    if (taskStatus === 'rejected') return { id: 'pr_pending', label: 'PR 待选中' }
    return { id: 'in_progress', label: '进行中' }
  }

  if (!isApplicantPrSelected(mp, applicant)) return { id: 'pr_pending', label: 'PR 待选中' }
  return { id: 'in_progress', label: '进行中' }
}

export function matchTalentApplicationProgress(
  progressId: TalentAppProgressId,
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
): boolean {
  if (progressId === 'all') return true
  return resolveTalentApplicationProgress(mp, applicant).id === progressId
}
