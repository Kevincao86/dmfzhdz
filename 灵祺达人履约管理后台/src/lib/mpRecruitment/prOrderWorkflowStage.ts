export type PrWorkflowStage = 'recruiting' | 'pending_schedule' | 'pending_video_review' | 'completed'

export type PrWorkflowMeta = {
  stage?: PrWorkflowStage
  scheduleSkippedAt?: string
  videoReviewSkippedAt?: string
  scheduleCompletedAt?: string
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

export function countPendingVideos(mp: Record<string, unknown> | null | undefined): number {
  if (!mp) return 0
  return selectedApplicants(mp).filter((a) => videoUrl(a) && String(a.videoStatus || 'pending') === 'pending').length
}

function isScheduleSkipped(mp: Record<string, unknown> | null | undefined): boolean {
  return Boolean(String(readMeta(mp).scheduleSkippedAt || '').trim())
}

function isVideoReviewSkipped(mp: Record<string, unknown> | null | undefined): boolean {
  return Boolean(String(readMeta(mp).videoReviewSkippedAt || '').trim())
}

export function isVisitScheduleDone(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  if (isIceMp(mp)) return true
  if (isScheduleSkipped(mp)) return true
  if (!String(readMeta(mp).scheduleCompletedAt || '').trim()) return false
  const pool = selectedApplicants(mp)
  if (!pool.length) return false
  return pool.every((a) => {
    const assigned = String(a.assignedVisitAt || '').trim()
    if (!assigned) return false
    const st = String(a.visitAssignmentStatus || '').trim()
    return st === 'confirmed'
  })
}

function isVideoReviewDone(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  if (String(mp.status || '') === 'done') return true
  if (isVideoReviewSkipped(mp)) return true
  const pool = selectedApplicants(mp)
  if (!pool.length) return false
  return pool.every((a) => videoUrl(a) && String(a.videoStatus || 'pending') === 'passed')
}

export function resolvePrWorkflowStage(mp: Record<string, unknown> | null | undefined): PrWorkflowStage {
  if (!mp) return 'recruiting'
  const explicit = readMeta(mp).stage
  if (explicit === 'completed' || String(mp.status || '') === 'done') return 'completed'
  if (isVideoReviewDone(mp)) return 'completed'
  if (explicit === 'pending_video_review') return 'pending_video_review'
  if (isVisitScheduleDone(mp) && hasNotifiedSelected(mp)) return 'pending_video_review'
  if (explicit === 'pending_schedule') return 'pending_schedule'
  if (hasNotifiedSelected(mp) && !isIceMp(mp)) return 'pending_schedule'
  if (hasNotifiedSelected(mp) && isIceMp(mp)) return 'pending_video_review'
  return 'recruiting'
}

export function matchPrOrdersTab(tabId: PrOrdersTabId, mp: Record<string, unknown> | null | undefined): boolean {
  const stage = resolvePrWorkflowStage(mp)
  if (tabId === 'published') return stage === 'recruiting'
  if (tabId === 'pending_schedule') return stage === 'pending_schedule'
  if (tabId === 'pending_video_review') return stage === 'pending_video_review'
  if (tabId === 'completed') return stage === 'completed'
  return false
}

export function buildSkipSchedulePatch(): Partial<PrWorkflowMeta> {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  return { stage: 'pending_video_review', scheduleSkippedAt: now }
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
