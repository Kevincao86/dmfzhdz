/** PR 发单履约阶段（与履约 Web prOrderWorkflowStage.ts 对齐） */

function isIceMp(mp) {
  return !!(mp && (mp.hall === 'ice' || mp.orderKind === 'ice'))
}

function readMeta(mp) {
  const meta = mp && mp.mpPublishMeta
  if (!meta || typeof meta !== 'object') return {}
  const wf = meta.prWorkflow
  if (!wf || typeof wf !== 'object') return {}
  return wf
}

function selectedApplicants(mp) {
  const ids = new Set((mp.selectedApplicantIds || []).map(String))
  const list = Array.isArray(mp.applicants) ? mp.applicants : []
  return list.filter(
    (a) =>
      a &&
      (a.prSelected || a.merchantSelected || ids.has(String(a.id))) &&
      a.taskStatus !== 'rejected',
  )
}

function hasNotifiedSelected(mp) {
  if (!mp) return false
  const notified = new Set((mp.notifiedApplicantIds || []).map(String))
  if (!notified.size) return false
  return selectedApplicants(mp).some((a) => notified.has(String(a.id)))
}

function videoUrl(a) {
  return String((a && (a.videoUrl || a.douyinPublishUrl)) || '').trim()
}

function isScheduleSkipped(mp) {
  return !!String(readMeta(mp).scheduleSkippedAt || '').trim()
}

function isScheduleQueueConfirmed(mp) {
  return !!String(readMeta(mp).scheduleQueueConfirmedAt || '').trim()
}

function isVideoReviewSkipped(mp) {
  return !!String(readMeta(mp).videoReviewSkippedAt || '').trim()
}

function readScheduleEffectiveAt(mp) {
  const meta = mp && mp.mpPublishMeta
  if (!meta || typeof meta !== 'object') return ''
  const sm = meta.visitScheduleMeta
  if (!sm || typeof sm !== 'object') return ''
  return String(sm.scheduleEffectiveAt || '').trim()
}

function isScheduleMarkedDone(mp) {
  return !!String(readMeta(mp).scheduleCompletedAt || '').trim() || !!readScheduleEffectiveAt(mp)
}

function isVisitScheduleDone(mp) {
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

function isVideoReviewDone(mp) {
  if (!mp) return false
  if (String(mp.status || '') === 'done') return true
  if (isVideoReviewSkipped(mp)) return true
  const pool = selectedApplicants(mp)
  if (!pool.length) return false
  return pool.every((a) => videoUrl(a) && String(a.videoStatus || 'pending') === 'passed')
}

function countPendingVideos(mp) {
  if (!mp) return 0
  return selectedApplicants(mp).filter((a) => {
    if (!videoUrl(a)) return false
    const s = String(a.videoStatus || '').trim()
    if (s === 'draft') return false
    return s === 'pending' || !s
  }).length
}

function resolvePrWorkflowStage(mp) {
  if (!mp) return 'recruiting'
  const meta = readMeta(mp)
  const explicit = meta.stage
  if (explicit === 'completed' || String(mp.status || '') === 'done') return 'completed'
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
  if (hasNotifiedSelected(mp) && isScheduleQueueConfirmed(mp) && !isIceMp(mp)) return 'pending_schedule'
  if (hasNotifiedSelected(mp) && isIceMp(mp)) return 'pending_video_review'
  return 'recruiting'
}

function canConfirmScheduleQueue(mp) {
  if (!mp || isIceMp(mp)) return false
  if (isScheduleQueueConfirmed(mp)) return false
  if (resolvePrWorkflowStage(mp) !== 'recruiting') return false
  return hasNotifiedSelected(mp)
}

function matchPrOrdersTab(tabId, mp) {
  const stage = resolvePrWorkflowStage(mp)
  if (tabId === 'published') return stage === 'recruiting'
  if (tabId === 'pending_schedule') return stage === 'pending_schedule'
  if (tabId === 'pending_video_review') return stage === 'pending_video_review'
  if (tabId === 'completed') return stage === 'completed'
  return false
}

function nowStr() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function buildPrWorkflowOrderPatch(mp, patch, status) {
  const prev = readMeta(mp)
  const prevMeta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const order = {
    ...mp,
    mpPublishMeta: Object.assign({}, prevMeta, { prWorkflow: Object.assign({}, prev, patch) }),
  }
  if (status) order.status = status
  return { id: mp.id, order: order }
}

function buildNotifyWorkflowPatch(mp) {
  if (isIceMp(mp)) return { stage: 'pending_video_review' }
  return {}
}

function buildConfirmScheduleQueuePatch() {
  return { stage: 'pending_schedule', scheduleQueueConfirmedAt: nowStr() }
}

function buildSkipSchedulePatch() {
  return { stage: 'pending_video_review', scheduleSkippedAt: nowStr() }
}

function buildScheduleCompletedPatch() {
  return { stage: 'pending_video_review', scheduleCompletedAt: nowStr() }
}

function buildSkipVideoReviewPatch() {
  return { stage: 'completed', videoReviewSkippedAt: nowStr(), completedAt: nowStr() }
}

module.exports = {
  resolvePrWorkflowStage,
  matchPrOrdersTab,
  hasNotifiedSelected,
  isVisitScheduleDone,
  canConfirmScheduleQueue,
  buildPrWorkflowOrderPatch,
  buildNotifyWorkflowPatch,
  buildConfirmScheduleQueuePatch,
  buildSkipSchedulePatch,
  buildScheduleCompletedPatch,
  buildSkipVideoReviewPatch,
}
