import { isIceMpOrder } from './orderCard'
import { getIceVerifyMode } from './iceOrderStats'

export type TalentAppProgressId = 'all' | 'pr_pending' | 'in_progress' | 'completed'

/** 我的报名页 Tab · 对齐小程序业务阶段 */
export type TalentAppTabId =
  | 'registered'
  | 'approved'
  | 'pending_visit'
  | 'pending_video'
  | 'completed'
  | 'cancelled'

export const TALENT_APPLICATION_TABS: { id: TalentAppTabId; label: string }[] = [
  { id: 'registered', label: '已报名' },
  { id: 'approved', label: '已通过' },
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
  showAssignConfirmBtn?: boolean
  showCheckInBtn?: boolean
  showEditVisitBtn?: boolean
  editVisitMode?: 'preference' | 'effective'
  visitHint?: string
}

export type ApplicationDisplayOpts = {
  selectionNotified?: boolean
  isIce?: boolean
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
  applicant: Record<string, unknown> | null | undefined,
): boolean {
  if (!applicant) return false
  if (applicant.prSelected === true || applicant.merchantSelected === true) return true
  const ids = Array.isArray(mp?.selectedApplicantIds) ? (mp!.selectedApplicantIds as unknown[]) : []
  return ids.map(String).includes(String(applicant.id || ''))
}

/** PR 已发入选通知（notifiedApplicantIds 或 inbox 入选信） */
export function isApplicantSelectionNotified(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null | undefined,
  selectionNotified?: boolean,
): boolean {
  if (selectionNotified === true) return true
  if (!applicant || !mp) return false
  const id = String(applicant.id || '').trim()
  if (!id) return false
  const ids = Array.isArray(mp.notifiedApplicantIds) ? (mp.notifiedApplicantIds as unknown[]) : []
  return ids.map(String).includes(id)
}

/** 达人已确认拍摄档期 */
export function isScheduleConfirmed(applicant: Record<string, unknown> | null | undefined): boolean {
  if (!applicant) return false
  if (String(applicant.scheduleConfirmedAt || '').trim()) return true
  const taskStatus = String(applicant.taskStatus || '')
  if (taskStatus === 'confirmed') return true
  const groupJoin = String(applicant.groupJoinStatus || '')
  if (groupJoin === 'confirmed' || groupJoin === 'joined') return true
  return false
}

/** 达人已提交探店意向（待 PR 排期） */
export function isTalentPreferenceSubmitted(
  applicant: Record<string, unknown> | null | undefined,
): boolean {
  if (!applicant) return false
  return (
    !!String(applicant.scheduleConfirmedAt || '').trim() &&
    !!String(applicant.talentPreferredVisitAt || '').trim()
  )
}

/** PR 已确认排期生效 */
export function isPrScheduleEffective(applicant: Record<string, unknown> | null | undefined): boolean {
  if (!applicant) return false
  const st = String(applicant.visitAssignmentStatus || '').trim()
  return st === 'confirmed' && !!String(applicant.assignedVisitAt || '').trim()
}

/** 达人已确认入选并提交探店意向（Step A） */
export function isTalentScheduleIntentConfirmed(
  applicant: Record<string, unknown> | null | undefined,
): boolean {
  return isTalentPreferenceSubmitted(applicant)
}

function parseVisitDayMs(timeStr: string): number {
  const s = String(timeStr || '').trim()
  if (!s) return 0
  const m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m) {
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
    return Number.isFinite(t) ? t : 0
  }
  const t = Date.parse(s.replace(/\//g, '-'))
  return Number.isFinite(t) ? t : 0
}

export function isVisitCheckInDay(assignedVisitAt: string, nowMs = Date.now()): boolean {
  const dayMs = parseVisitDayMs(assignedVisitAt)
  if (!dayMs) return false
  const start = new Date(dayMs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(dayMs)
  end.setHours(23, 59, 59, 999)
  return nowMs >= start.getTime() && nowMs <= end.getTime()
}

function resolveVisitDisplayExtras(
  applicant: Record<string, unknown> | null,
): Partial<
  Pick<ApplicationDisplayStatus, 'showAssignConfirmBtn' | 'showCheckInBtn' | 'showEditVisitBtn' | 'visitHint' | 'label'>
> {
  if (!applicant) return {}
  const assigned = String(applicant.assignedVisitAt || '').trim()
  const preferred = String(applicant.talentPreferredVisitAt || '').trim()
  const assignStatus = String(applicant.visitAssignmentStatus || '').trim()
  const checkedIn = String(applicant.visitCheckInAt || '').trim()
  if (!assigned && preferred) {
    return { label: '排期待确认', visitHint: `已提交意向：${preferred}，等待 PR 排期` }
  }
  if (!assigned) {
    return { visitHint: 'PR 正在安排探店时间，请留意消息通知' }
  }
  if (assignStatus === 'pending_talent_confirm') {
    return {
      label: '待确认排期',
      showAssignConfirmBtn: true,
      visitHint: `${assigned} · ${String(applicant.assignedVisitStore || '').trim() || '门店'}`,
    }
  }
  if (assignStatus === 'declined') {
    return { label: '档期冲突', visitHint: '已反馈冲突，请联系 PR 重新排期' }
  }
  if (!checkedIn && isVisitCheckInDay(assigned)) {
    return {
      label: '待签到',
      showCheckInBtn: true,
      visitHint: `今日探店 · ${assigned}`,
    }
  }
  if (!checkedIn) {
    return {
      label: '待探店',
      visitHint: `已确认排期 · ${assigned}`,
      showEditVisitBtn: isPrScheduleEffective(applicant),
    }
  }
  return { label: '已签到', visitHint: `签到时间 ${checkedIn}` }
}

function needsScheduleConfirm(
  applicant: Record<string, unknown> | null,
  isIce: boolean,
): boolean {
  if (!applicant || isIce) return false
  if (isTalentScheduleIntentConfirmed(applicant)) return false
  if (String(applicant.taskStatus || '') === 'rejected') return false
  return true
}

/** 探店/拍摄类：仅 PR 选中达人后才可上传成片 */
export function canTalentUploadRecruitmentVideo(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  isIce: boolean,
): boolean {
  if (isIce) return false
  if (!applicant || !isApplicantPrSelected(mp, applicant)) return false
  if (!String(applicant.visitCheckInAt || '').trim()) return false
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
  opts?: ApplicationDisplayOpts,
): ApplicationDisplayStatus {
  const isIce = opts?.isIce ?? resolveIceContext(mp, mpOrderId)

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

  if (isIce && applicant) {
    const taskStatus = String(applicant.taskStatus || '')
    if (
      taskStatus === 'pending_confirm' ||
      taskStatus === 'applied' ||
      (!taskStatus && !applicant.assignedVideoDownloadUrl)
    ) {
      return {
        tabId: 'registered',
        label: '待确认接收',
        tone: 'pending',
        showConfirmBtn: true,
      }
    }
  }

  const prSelected = isApplicantPrSelected(mp, applicant)
  const notified = isApplicantSelectionNotified(mp, applicant, opts?.selectionNotified)

  if (!isIce && prSelected && notified && !isTalentScheduleIntentConfirmed(applicant)) {
    return {
      tabId: 'approved',
      label: '已通过',
      tone: 'accepted',
      showConfirmBtn: needsScheduleConfirm(applicant, isIce),
    }
  }

  if (
    !isIce &&
    prSelected &&
    notified &&
    applicant &&
    isTalentPreferenceSubmitted(applicant) &&
    !isPrScheduleEffective(applicant)
  ) {
    const preferred = String(applicant.talentPreferredVisitAt || '').trim()
    return {
      tabId: 'approved',
      label: '排期待确认',
      tone: 'accepted',
      showConfirmBtn: false,
      showEditVisitBtn: true,
      editVisitMode: 'preference',
      visitHint: preferred ? `已提交：${preferred}` : '等待 PR 排期',
    }
  }

  if (!isIce && prSelected && notified && isPrScheduleEffective(applicant)) {
    const visitExtras = resolveVisitDisplayExtras(applicant)
    if (isPendingVideoPhase(mp, applicant, mpOrderId)) {
      return { tabId: 'pending_video', label: '待传视频', tone: 'accepted', showConfirmBtn: false }
    }
    return {
      tabId: 'pending_visit',
      label: visitExtras.label || '待探店',
      tone: 'accepted',
      showConfirmBtn: false,
      showAssignConfirmBtn: visitExtras.showAssignConfirmBtn,
      showCheckInBtn: visitExtras.showCheckInBtn,
      showEditVisitBtn: visitExtras.showEditVisitBtn,
      editVisitMode: visitExtras.showEditVisitBtn ? 'effective' : undefined,
      visitHint: visitExtras.visitHint,
    }
  }

  if (progress.id === 'pr_pending' || (prSelected && !notified)) {
    return { tabId: 'registered', label: '已报名', tone: 'pending', showConfirmBtn: false }
  }

  if (!isIce && applicant && prSelected) {
    return { tabId: 'pending_visit', label: '待探店', tone: 'accepted', showConfirmBtn: false }
  }

  return { tabId: 'registered', label: '已报名', tone: 'pending', showConfirmBtn: false }
}

export function matchTalentApplicationTab(
  tabId: TalentAppTabId,
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  mpOrderId?: string,
  opts?: ApplicationDisplayOpts,
): boolean {
  return resolveApplicationDisplayStatus(mp, applicant, mpOrderId, opts).tabId === tabId
}
