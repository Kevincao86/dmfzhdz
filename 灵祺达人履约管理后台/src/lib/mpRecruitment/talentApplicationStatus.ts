import { isIceMpOrder } from './orderCard'
import { getIceVerifyMode } from './iceOrderStats'

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
  return ids.map(String).includes(String(applicant.id || ''))
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
  if (isApplicantPassed(applicant)) return { id: 'completed', label: '已完成' }

  if (ice) {
    const taskStatus = String(applicant.taskStatus || '')
    if (taskStatus === 'rejected') return { id: 'in_progress', label: '已拒绝' }
    if (
      taskStatus === 'pending_confirm' ||
      taskStatus === 'applied' ||
      (!taskStatus && !applicant.assignedVideoDownloadUrl)
    ) {
      return { id: 'in_progress', label: '待确认接收' }
    }
    if (taskStatus === 'confirmed') {
      const link = String(applicant.douyinPublishUrl || '').trim()
      const verifyMode = getIceVerifyMode(mp)
      if (verifyMode === 'pr' && applicant.videoStatus === 'pending' && !isApplicantPassed(applicant)) {
        return { id: 'in_progress', label: '链接待 PR 审核' }
      }
      if (verifyMode === 'ai' && applicant.aiVerifyStatus === 'pending' && link) {
        return { id: 'in_progress', label: 'AI 核查中' }
      }
      if (applicant.aiVerifyStatus === 'failed' || applicant.videoStatus === 'rejected') {
        return {
          id: 'in_progress',
          label: applicant.videoStatus === 'rejected' ? '链接已驳回' : 'AI 核查未通过',
        }
      }
      if (!link) return { id: 'in_progress', label: '待回传链接' }
      return { id: 'in_progress', label: '进行中' }
    }
    return { id: 'in_progress', label: '进行中' }
  }

  if (!isApplicantPrSelected(mp, applicant)) return { id: 'pr_pending', label: 'PR 待选中' }
  return { id: 'in_progress', label: '进行中' }
}
