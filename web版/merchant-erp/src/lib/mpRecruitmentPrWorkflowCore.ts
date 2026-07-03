import type { RegistryMpRecruitmentApplicant, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { isIceMpOrder } from './iceOrderDetect.js'

export type PrWorkflowStage = 'recruiting' | 'pending_schedule' | 'pending_video_review' | 'completed'

export type PrWorkflowMeta = {
  stage?: PrWorkflowStage
  scheduleSkippedAt?: string
  videoReviewSkippedAt?: string
  scheduleCompletedAt?: string
  scheduleQueueConfirmedAt?: string
  completedAt?: string
}

export const PR_WORKFLOW_TAB_LABELS: Record<PrWorkflowStage, string> = {
  recruiting: '已发布',
  pending_schedule: '待排期',
  pending_video_review: '待视频审核',
  completed: '已完成',
}

function nowStr(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

export function readPrWorkflowMeta(mp: RegistryMpRecruitmentOrder | null | undefined): PrWorkflowMeta {
  const meta = mp?.mpPublishMeta
  if (!meta || typeof meta !== 'object') return {}
  const wf = (meta as Record<string, unknown>).prWorkflow
  if (!wf || typeof wf !== 'object' || Array.isArray(wf)) return {}
  return wf as PrWorkflowMeta
}

function selectedApplicants(mp: RegistryMpRecruitmentOrder): RegistryMpRecruitmentApplicant[] {
  const ids = new Set((mp.selectedApplicantIds || []).map(String))
  const list = Array.isArray(mp.applicants) ? mp.applicants : []
  return list.filter(
    (a) =>
      a &&
      (a.prSelected || a.merchantSelected || ids.has(String(a.id))) &&
      a.taskStatus !== 'rejected',
  )
}

export function hasNotifiedSelected(mp: RegistryMpRecruitmentOrder | null | undefined): boolean {
  if (!mp) return false
  const notified = new Set((mp.notifiedApplicantIds || []).map(String))
  if (!notified.size) return false
  return selectedApplicants(mp).some((a) => notified.has(String(a.id)))
}

function applicantVideoUrl(a: RegistryMpRecruitmentApplicant): string {
  return String(a.videoUrl || a.douyinPublishUrl || '').trim()
}

export function countPendingVideos(mp: RegistryMpRecruitmentOrder | null | undefined): number {
  if (!mp) return 0
  return selectedApplicants(mp).filter((a) => {
    if (!applicantVideoUrl(a)) return false
    return String(a.videoStatus || 'pending') === 'pending'
  }).length
}

export function countSubmittedVideos(mp: RegistryMpRecruitmentOrder | null | undefined): number {
  if (!mp) return 0
  return selectedApplicants(mp).filter((a) => applicantVideoUrl(a)).length
}

export function isScheduleSkipped(mp: RegistryMpRecruitmentOrder | null | undefined): boolean {
  return Boolean(String(readPrWorkflowMeta(mp).scheduleSkippedAt || '').trim())
}

export function isScheduleQueueConfirmed(mp: RegistryMpRecruitmentOrder | null | undefined): boolean {
  return Boolean(String(readPrWorkflowMeta(mp).scheduleQueueConfirmedAt || '').trim())
}

export function isVideoReviewSkipped(mp: RegistryMpRecruitmentOrder | null | undefined): boolean {
  return Boolean(String(readPrWorkflowMeta(mp).videoReviewSkippedAt || '').trim())
}

function readScheduleEffectiveAt(mp: RegistryMpRecruitmentOrder | null | undefined): string {
  const scheduleMeta =
    mp?.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>).visitScheduleMeta
      : null
  return scheduleMeta && typeof scheduleMeta === 'object' && !Array.isArray(scheduleMeta)
    ? String((scheduleMeta as Record<string, unknown>).scheduleEffectiveAt || '').trim()
    : ''
}

function isScheduleMarkedDone(mp: RegistryMpRecruitmentOrder | null | undefined): boolean {
  return (
    !!String(readPrWorkflowMeta(mp).scheduleCompletedAt || '').trim() ||
    !!readScheduleEffectiveAt(mp)
  )
}

/** 已选达人探店排期均已下发且达人已确认（或无需排期的云剪单） */
export function isVisitScheduleDone(mp: RegistryMpRecruitmentOrder | null | undefined): boolean {
  if (!mp) return false
  if (isIceMpOrder(mp)) return true
  if (isScheduleSkipped(mp)) return true
  if (!isScheduleMarkedDone(mp)) return false
  const pool = selectedApplicants(mp)
  if (!pool.length) return false
  return pool.every((a) => {
    const assigned = String(a.assignedVisitAt || '').trim()
    if (!assigned) return false
    const st = String(a.visitAssignmentStatus || '').trim()
    return st === 'confirmed'
  })
}

export function isVideoReviewDone(mp: RegistryMpRecruitmentOrder | null | undefined): boolean {
  if (!mp) return false
  if (mp.status === 'done') return true
  if (isVideoReviewSkipped(mp)) return true
  const pool = selectedApplicants(mp)
  if (!pool.length) return false
  return pool.every((a) => {
    const url = applicantVideoUrl(a)
    if (!url) return false
    return String(a.videoStatus || 'pending') === 'passed'
  })
}

export function resolvePrWorkflowStage(mp: RegistryMpRecruitmentOrder | null | undefined): PrWorkflowStage {
  if (!mp) return 'recruiting'
  const meta = readPrWorkflowMeta(mp)
  const explicit = meta.stage
  if (explicit === 'completed' || mp.status === 'done') return 'completed'
  if (isVideoReviewDone(mp)) return 'completed'
  if (isScheduleSkipped(mp)) return 'pending_video_review'
  if (isVisitScheduleDone(mp)) return 'pending_video_review'
  if (
    explicit === 'pending_video_review' &&
    (isScheduleMarkedDone(mp) || countPendingVideos(mp) > 0)
  ) {
    return 'pending_video_review'
  }
  if (explicit === 'pending_schedule') return 'pending_schedule'
  if (hasNotifiedSelected(mp) && !isIceMpOrder(mp)) return 'pending_schedule'
  if (hasNotifiedSelected(mp) && isIceMpOrder(mp)) return 'pending_video_review'
  return 'recruiting'
}

export function mergePrWorkflowIntoOrder(
  mp: RegistryMpRecruitmentOrder,
  patch: Partial<PrWorkflowMeta>,
): RegistryMpRecruitmentOrder {
  const prev = readPrWorkflowMeta(mp)
  const next: PrWorkflowMeta = { ...prev, ...patch }
  const prevMeta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return {
    ...mp,
    mpPublishMeta: {
      ...(prevMeta as Record<string, unknown>),
      prWorkflow: next,
    },
  }
}

export function buildNotifyWorkflowPatch(mp: RegistryMpRecruitmentOrder): Partial<PrWorkflowMeta> {
  if (isIceMpOrder(mp)) return { stage: 'pending_video_review' }
  return buildConfirmScheduleQueuePatch()
}

export function buildConfirmScheduleQueuePatch(): Partial<PrWorkflowMeta> {
  return { stage: 'pending_schedule', scheduleQueueConfirmedAt: nowStr() }
}

export function buildSkipSchedulePatch(): Partial<PrWorkflowMeta> {
  return { stage: 'pending_video_review', scheduleSkippedAt: nowStr() }
}

export function buildScheduleCompletedPatch(): Partial<PrWorkflowMeta> {
  return { stage: 'pending_video_review', scheduleCompletedAt: nowStr() }
}

export function buildSkipVideoReviewPatch(): Partial<PrWorkflowMeta> {
  return { stage: 'completed', videoReviewSkippedAt: nowStr(), completedAt: nowStr() }
}

export function buildWorkflowCompletedPatch(): Partial<PrWorkflowMeta> {
  return { stage: 'completed', completedAt: nowStr() }
}
