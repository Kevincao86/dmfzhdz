import { isIceMpOrder } from './orderCard'
import { getIceVerifyMode } from './iceOrderStats'

export type TalentAppProgressId = 'all' | 'pr_pending' | 'in_progress' | 'completed'

/** 我的报名页 Tab · 对齐小程序业务阶段 */
export type TalentAppTabId = 'registered' | 'pending_visit' | 'pending_video' | 'completed' | 'cancelled'

export const TALENT_APPLICATION_TABS: { id: TalentAppTabId; label: string }[] = [
  { id: 'registered', label: '已报名' },
  { id: 'pending_visit', label: '待探店' },
  { id: 'pending_video', label: '待传视频' },
  { id: 'completed', label: '已完成' },
  { id: 'cancelled', label: '已取消' },
]

export type ApplicationDisplayTone = 'pending' | 'accepted' | 'completed' | 'cancelled'

export type ApplicationDisplayStatus = {
  tabId: TalentAppTabId
  label: string
  tone: ApplicationDisplayTone
  showConfirmBtn: boolean
}

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

export function isApplicantPrSelected(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown>,
): boolean {
  if (applicant.prSelected === true || applicant.merchantSelected === true) return true
  const ids = Array.isArray(mp?.selectedApplicantIds) ? (mp!.selectedApplicantIds as unknown[]) : []
  return ids.map(String).includes(String(applicant.id || ''))
}

/** 探店/拍摄类：仅 PR 选中达人后才可上传成片 */
export function canTalentUploadRecruitmentVideo(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  isIce: boolean,
): boolean {
  if (isIce) return false
  if (!applicant || !isApplicantPrSelected(mp, applicant)) return false
  const videoStatus = String(applicant.videoStatus || '')
  return !videoStatus || videoStatus === 'rejected'
}

function resolveIceContext(mp: Record<string, unknown> | null, mpOrderId?: string): boolean {
  if (isIceMpOrder(mp)) return true
  const orderId = String(mpOrderId || mp?.id || '').trim()
  return /^MP-ICE-/i.test(orderId)
}

function isPendingVideoPhase(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  mpOrderId?: string,
): boolean {
  if (!applicant) return false
  const ice = resolveIceContext(mp, mpOrderId)
  const progress = resolveTalentApplicationProgress(mp, applicant, mpOrderId)
  if (ice) {
    const link = String(applicant.douyinPublishUrl || '').trim()
    const verifyMode = getIceVerifyMode(mp)
    if (progress.label.includes('待回传') || progress.label.includes('链接')) return true
    if (applicant.aiVerifyStatus === 'failed' || applicant.videoStatus === 'rejected') return true
    if (verifyMode === 'pr' && applicant.videoStatus === 'pending') return true
    if (verifyMode === 'ai' && applicant.aiVerifyStatus === 'pending' && link) return true
    return false
  }
  const videoStatus = String(applicant.videoStatus || '')
  if (canTalentUploadRecruitmentVideo(mp, applicant, false)) return true
  if (videoStatus === 'pending' || videoStatus === 'rejected') return true
  if (/上传|审核|链接|回传/.test(progress.label)) return true
  return false
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

export function resolveApplicationDisplayStatus(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  mpOrderId?: string,
): ApplicationDisplayStatus {
  if (applicant?.taskStatus === 'rejected') {
    return { tabId: 'cancelled', label: '已取消', tone: 'cancelled', showConfirmBtn: false }
  }

  const progress = resolveTalentApplicationProgress(mp, applicant, mpOrderId)
  if (progress.id === 'completed') {
    return { tabId: 'completed', label: '已完成', tone: 'completed', showConfirmBtn: false }
  }

  if (isPendingVideoPhase(mp, applicant, mpOrderId)) {
    return { tabId: 'pending_video', label: '待传视频', tone: 'accepted', showConfirmBtn: false }
  }

  if (progress.id === 'pr_pending') {
    const taskStatus = String(applicant?.taskStatus || '')
    const pendingConfirm =
      taskStatus === 'pending_confirm' ||
      taskStatus === 'applied' ||
      progress.label.includes('待确认')
    return {
      tabId: 'registered',
      label: '已报名',
      tone: 'pending',
      showConfirmBtn: pendingConfirm,
    }
  }

  if (isApplicantPrSelected(mp, applicant!)) {
    return { tabId: 'pending_visit', label: '待探店', tone: 'accepted', showConfirmBtn: false }
  }

  return { tabId: 'registered', label: '已报名', tone: 'pending', showConfirmBtn: false }
}

export function matchTalentApplicationTab(
  tabId: TalentAppTabId,
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  mpOrderId?: string,
): boolean {
  return resolveApplicationDisplayStatus(mp, applicant, mpOrderId).tabId === tabId
}
