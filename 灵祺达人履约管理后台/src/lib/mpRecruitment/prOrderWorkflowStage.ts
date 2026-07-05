import { isScriptReviewPlatform } from './deliveryReviewPlatform.js'

export type PrWorkflowStage = 'recruiting' | 'pending_schedule' | 'pending_video_review' | 'pending_script_review' | 'completed'

export type PrWorkflowMeta = {
  stage?: PrWorkflowStage
  scheduleSkippedAt?: string
  videoReviewSkippedAt?: string
  scheduleCompletedAt?: string
  scheduleQueueConfirmedAt?: string
  completedAt?: string
}

export const PR_WORKFLOW_TABS = [
  { id: 'published' as const, stage: 'recruiting' as const, label: '已发布' },
  { id: 'pending_schedule' as const, stage: 'pending_schedule' as const, label: '待排期' },
  { id: 'pending_video_review' as const, stage: 'pending_video_review' as const, label: '待视频审核' },
  { id: 'completed' as const, stage: 'completed' as const, label: '已完成' },
  { id: 'drafts' as const, stage: null, label: '草稿箱' },
  { id: 'stopped' as const, stage: null, label: '已停止' },
  { id: 'deleted' as const, stage: null, label: '已删除' },
]

export type PrOrdersTabId = (typeof PR_WORKFLOW_TABS)[number]['id']

function isIceMp(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  return mp.hall === 'ice' || mp.orderKind === 'ice'
}

function readMeta(mp: Record<string, unknown> | null | undefined): PrWorkflowMeta {
  const meta = mp?.mpPublishMeta
  if (!meta || typeof meta !== 'object') return {}
  const wf = (meta as Record<string, unknown>).prWorkflow
  if (!wf || typeof wf !== 'object' || Array.isArray(wf)) return {}
  return wf as PrWorkflowMeta
}

function selectedApplicants(mp: Record<string, unknown>): Record<string, unknown>[] {
  const ids = new Set((Array.isArray(mp.selectedApplicantIds) ? mp.selectedApplicantIds : []).map(String))
  const list = Array.isArray(mp.applicants) ? (mp.applicants as Record<string, unknown>[]) : []
  return list.filter(
    (a) =>
      a &&
      (a.prSelected || a.merchantSelected || ids.has(String(a.id))) &&
      a.taskStatus !== 'rejected',
  )
}

export function hasNotifiedSelected(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  const notified = new Set((Array.isArray(mp.notifiedApplicantIds) ? mp.notifiedApplicantIds : []).map(String))
  if (!notified.size) return false
  return selectedApplicants(mp).some((a) => notified.has(String(a.id)))
}

function videoUrl(a: Record<string, unknown>): string {
  return String(a.videoUrl || a.douyinPublishUrl || '').trim()
}

function visitVideoUrl(a: Record<string, unknown>): string {
  return String(a.videoUrl || '').trim()
}

function publishLinkUrl(a: Record<string, unknown>): string {
  return String(a.douyinPublishUrl || a.visitPublishUrl || '').trim()
}

export function countPendingVideos(mp: Record<string, unknown> | null | undefined): number {
  if (!mp) return 0
  return selectedApplicants(mp).filter((a) => {
    if (!videoUrl(a)) return false
    const s = String(a.videoStatus ?? '').trim()
    if (s === 'draft') return false
    return s === 'pending' || !s
  }).length
}

function isScheduleQueueConfirmed(mp: Record<string, unknown> | null | undefined): boolean {
  return Boolean(String(readMeta(mp).scheduleQueueConfirmedAt || '').trim())
}

function isScheduleSkipped(mp: Record<string, unknown> | null | undefined): boolean {
  return Boolean(String(readMeta(mp).scheduleSkippedAt || '').trim())
}

function isVideoReviewSkipped(mp: Record<string, unknown> | null | undefined): boolean {
  return Boolean(String(readMeta(mp).videoReviewSkippedAt || '').trim())
}

function readScheduleEffectiveAt(mp: Record<string, unknown> | null | undefined): string {
  if (!mp?.mpPublishMeta || typeof mp.mpPublishMeta !== 'object') return ''
  const meta = mp.mpPublishMeta as Record<string, unknown>
  const sm = meta.visitScheduleMeta
  if (!sm || typeof sm !== 'object' || Array.isArray(sm)) return ''
  return String((sm as Record<string, unknown>).scheduleEffectiveAt || '').trim()
}

function isScheduleMarkedDone(mp: Record<string, unknown> | null | undefined): boolean {
  return (
    !!String(readMeta(mp).scheduleCompletedAt || '').trim() || !!readScheduleEffectiveAt(mp)
  )
}

export function isVisitScheduleDone(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  if (isIceMp(mp)) return true
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

function scriptPayload(a: Record<string, unknown>): string {
  return String(a.scriptUrl || a.scriptLinkUrl || '').trim()
}

function isScriptReviewDone(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp || !isScriptReviewPlatform(mp.platform)) return false
  if (String(mp.status || '') === 'done') return true
  if (isVideoReviewSkipped(mp)) return true
  const pool = selectedApplicants(mp)
  if (!pool.length) return false
  return pool.every((a) => scriptPayload(a) && String(a.scriptStatus || 'pending') === 'passed')
}

function isDeliveryReviewDone(mp: Record<string, unknown> | null | undefined): boolean {
  if (isScriptReviewPlatform(mp?.platform)) return isScriptReviewDone(mp)
  if (isIceMp(mp)) return isVideoReviewDone(mp)
  return isVisitPublishLinkDone(mp)
}

function normalizeReviewStage(
  mp: Record<string, unknown> | null | undefined,
  stage: PrWorkflowStage,
): PrWorkflowStage {
  if (!mp || stage !== 'pending_video_review') return stage
  if (isScriptReviewPlatform(mp.platform)) return 'pending_script_review'
  return stage
}

function isVideoReviewDone(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  if (String(mp.status || '') === 'done') return true
  if (isVideoReviewSkipped(mp)) return true
  const pool = selectedApplicants(mp)
  if (!pool.length) return false
  return pool.every((a) => visitVideoUrl(a) && String(a.videoStatus || 'pending') === 'passed')
}

function isVisitPublishLinkDone(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp || isIceMp(mp)) return false
  if (isScriptReviewPlatform(mp.platform)) return false
  const pool = selectedApplicants(mp)
  if (!pool.length) return false
  if (!isVideoReviewDone(mp)) return false
  return pool.every((a) => publishLinkUrl(a))
}

export function countPendingScripts(mp: Record<string, unknown> | null | undefined): number {
  if (!mp || !isScriptReviewPlatform(mp.platform)) return 0
  return selectedApplicants(mp).filter((a) => {
    const url = scriptPayload(a)
    if (!url) return false
    const s = String(a.scriptStatus ?? '').trim()
    if (s === 'draft') return false
    return s === 'pending' || !s
  }).length
}

export function resolvePrWorkflowStage(mp: Record<string, unknown> | null | undefined): PrWorkflowStage {
  if (!mp) return 'recruiting'
  const meta = readMeta(mp)
  const explicit = meta.stage
  if (explicit === 'completed' || String(mp.status || '') === 'done') return 'completed'
  if (isDeliveryReviewDone(mp)) return 'completed'
  if (isScheduleSkipped(mp)) return normalizeReviewStage(mp, 'pending_video_review')
  if (isVisitScheduleDone(mp)) return normalizeReviewStage(mp, 'pending_video_review')
  if (
    (explicit === 'pending_video_review' || explicit === 'pending_script_review') &&
    (isScheduleMarkedDone(mp) || countPendingVideos(mp) > 0 || countPendingScripts(mp) > 0)
  ) {
    return normalizeReviewStage(mp, 'pending_video_review')
  }
  if (explicit === 'pending_schedule') return 'pending_schedule'
  if (hasNotifiedSelected(mp) && !isIceMp(mp)) return 'pending_schedule'
  if (hasNotifiedSelected(mp) && isIceMp(mp)) return 'pending_video_review'
  return 'recruiting'
}

export function canConfirmScheduleQueue(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp || isIceMp(mp)) return false
  if (isScheduleQueueConfirmed(mp)) return false
  if (resolvePrWorkflowStage(mp) !== 'recruiting') return false
  return hasNotifiedSelected(mp)
}

export function buildConfirmScheduleQueuePatch(): Partial<PrWorkflowMeta> {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  return { stage: 'pending_schedule', scheduleQueueConfirmedAt: now }
}

export function buildNotifyWorkflowPatch(mp: Record<string, unknown> | null | undefined): Partial<PrWorkflowMeta> {
  if (isIceMp(mp)) return { stage: 'pending_video_review' }
  return buildConfirmScheduleQueuePatch()
}

export function buildScheduleCompletedPatch(mp?: Record<string, unknown> | null): Partial<PrWorkflowMeta> {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const stage = mp && isScriptReviewPlatform(mp.platform) ? 'pending_script_review' : 'pending_video_review'
  return { stage, scheduleCompletedAt: now }
}

export function matchPrOrdersTab(tabId: PrOrdersTabId, mp: Record<string, unknown> | null | undefined): boolean {
  const stage = resolvePrWorkflowStage(mp)
  if (tabId === 'published') return stage === 'recruiting'
  if (tabId === 'pending_schedule') return stage === 'pending_schedule'
  if (tabId === 'pending_video_review') {
    return stage === 'pending_video_review' || stage === 'pending_script_review'
  }
  if (tabId === 'completed') return stage === 'completed'
  return false
}

export function buildSkipSchedulePatch(mp?: Record<string, unknown> | null): Partial<PrWorkflowMeta> {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const stage = mp && isScriptReviewPlatform(mp.platform) ? 'pending_script_review' : 'pending_video_review'
  return { stage, scheduleSkippedAt: now }
}

export function buildSkipVideoReviewPatch(): Partial<PrWorkflowMeta> {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  return { stage: 'completed', videoReviewSkippedAt: now, completedAt: now }
}

export function buildPrWorkflowOrderPatch(
  mp: Record<string, unknown>,
  patch: Partial<PrWorkflowMeta>,
  status?: string,
): Record<string, unknown> {
  const prev = readMeta(mp)
  const prevMeta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return {
    id: mp.id,
    order: {
      ...mp,
      ...(status ? { status } : {}),
      mpPublishMeta: {
        ...(prevMeta as Record<string, unknown>),
        prWorkflow: { ...prev, ...patch },
      },
    },
  }
}
