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
      (a.prSelected || a.merchantSelected || ids.indexOf(String(a.id)) >= 0) &&
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

function isVideoReviewSkipped(mp) {
  return !!String(readMeta(mp).videoReviewSkippedAt || '').trim()
}

function isVisitScheduleDone(mp) {
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

function isVideoReviewDone(mp) {
  if (!mp) return false
  if (String(mp.status || '') === 'done') return true
  if (isVideoReviewSkipped(mp)) return true
  const pool = selectedApplicants(mp)
  if (!pool.length) return false
  return pool.every((a) => videoUrl(a) && String(a.videoStatus || 'pending') === 'passed')
}

function resolvePrWorkflowStage(mp) {
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
  return { stage: isIceMp(mp) ? 'pending_video_review' : 'pending_schedule' }
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
  buildPrWorkflowOrderPatch,
  buildNotifyWorkflowPatch,
  buildSkipSchedulePatch,
  buildScheduleCompletedPatch,
  buildSkipVideoReviewPatch,
}
