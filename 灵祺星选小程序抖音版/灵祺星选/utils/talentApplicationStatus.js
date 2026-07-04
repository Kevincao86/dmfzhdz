const { isIceMpOrder } = require('./iceOrderDetect.js')
const { getIceVerifyMode } = require('./iceOrderStats.js')
const deliveryReview = require('./deliveryReviewPlatform.js')

const TALENT_APPLICATION_TABS = [
  { id: 'registered', label: '已报名' },
  { id: 'approved', label: '已通过' },
  { id: 'pending_visit', label: '待探店' },
  { id: 'pending_video', label: '待传视频' },
  { id: 'completed', label: '已完成' },
  { id: 'cancelled', label: '已取消' },
]

function talentApplicationTabsForGroup(group) {
  const pendingLabel = group === 'script' ? '待传文稿' : '待传视频'
  return TALENT_APPLICATION_TABS.map((t) =>
    t.id === 'pending_video' ? { ...t, label: pendingLabel } : { ...t },
  )
}

const TALENT_APP_PROGRESS_FILTERS = [
  { id: 'all', label: '全部状态' },
  { id: 'pr_pending', label: 'PR 待选中' },
  { id: 'in_progress', label: '进行中' },
  { id: 'completed', label: '已完成' },
]

function isApplicantPassed(applicant, isIce) {
  if (!applicant) return false
  if (String(applicant.completedAt || '').trim()) return true
  if (isIce) {
    if (applicant.aiVerifyStatus === 'passed') return true
    if (applicant.videoStatus === 'passed' && String(applicant.douyinPublishUrl || '').trim()) return true
  }
  return false
}

function canTalentSubmitVisitPublishLink(mp, applicant, isIce) {
  if (isIce || !applicant) return false
  if (String(applicant.videoStatus || '') !== 'passed') return false
  if (String(applicant.completedAt || '').trim()) return false
  const link = String(applicant.douyinPublishUrl || '').trim()
  if (!link) return true
  return applicant.aiVerifyStatus === 'failed'
}

function resolveVisitPublishPhase(applicant) {
  if (!applicant) return null
  if (String(applicant.videoStatus || '') !== 'passed') return null
  if (String(applicant.completedAt || '').trim()) return null
  const link = String(applicant.douyinPublishUrl || '').trim()
  if (applicant.aiVerifyStatus === 'pending' && link) return 'ai_pending'
  if (applicant.aiVerifyStatus === 'failed') return 'link_failed'
  return 'awaiting_link'
}

function isApplicantPrSelected(mp, applicant) {
  if (!applicant) return false
  if (applicant.prSelected === true || applicant.merchantSelected === true) return true
  const ids = Array.isArray(mp && mp.selectedApplicantIds) ? mp.selectedApplicantIds : []
  return ids.map(String).includes(String(applicant.id || ''))
}

function isApplicantSelectionNotified(mp, applicant, selectionNotified) {
  if (selectionNotified === true) return true
  if (!applicant || !mp) return false
  const id = String(applicant.id || '').trim()
  if (!id) return false
  const ids = Array.isArray(mp.notifiedApplicantIds) ? mp.notifiedApplicantIds : []
  return ids.map(String).includes(id)
}

function isScheduleConfirmed(applicant) {
  if (!applicant) return false
  if (String(applicant.scheduleConfirmedAt || '').trim()) return true
  const taskStatus = String(applicant.taskStatus || '')
  if (taskStatus === 'confirmed') return true
  const groupJoin = String(applicant.groupJoinStatus || '')
  if (groupJoin === 'confirmed' || groupJoin === 'joined') return true
  return false
}

function isTalentPreferenceSubmitted(applicant) {
  if (!applicant) return false
  return (
    !!String(applicant.scheduleConfirmedAt || '').trim() &&
    !!String(applicant.talentPreferredVisitAt || '').trim()
  )
}

function isPrScheduleEffective(applicant, mp) {
  if (!applicant) return false
  const assigned = String(applicant.assignedVisitAt || '').trim()
  if (!assigned) return false
  const st = String(applicant.visitAssignmentStatus || '').trim()
  if (st === 'confirmed') return true
  if (st === 'declined') return false
  const meta = mp && mp.mpPublishMeta
  if (!meta || typeof meta !== 'object') return false
  const sm = meta.visitScheduleMeta
  const scheduleEffectiveAt =
    sm && typeof sm === 'object' ? String(sm.scheduleEffectiveAt || '').trim() : ''
  const wf = meta.prWorkflow
  const scheduleCompletedAt =
    wf && typeof wf === 'object' ? String(wf.scheduleCompletedAt || '').trim() : ''
  if (scheduleEffectiveAt || scheduleCompletedAt) return true
  return false
}

function isTalentScheduleIntentConfirmed(applicant) {
  return isTalentPreferenceSubmitted(applicant)
}

function parseVisitDayMs(timeStr) {
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

function isVisitCheckInDay(assignedVisitAt, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs
  const dayMs = parseVisitDayMs(assignedVisitAt)
  if (!dayMs) return false
  const start = new Date(dayMs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(dayMs)
  end.setHours(23, 59, 59, 999)
  return now >= start.getTime() && now <= end.getTime()
}

function resolveVisitDisplayExtras(applicant) {
  if (!applicant) return {}
  const assigned = String(applicant.assignedVisitAt || '').trim()
  const preferred = String(applicant.talentPreferredVisitAt || '').trim()
  const assignStatus = String(applicant.visitAssignmentStatus || '').trim()
  const checkedIn =
    String(applicant.visitCheckInAt || '').trim() ||
    (String(applicant.visitStatus || '').trim() === 'checked_in' ? '1' : '')
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
  if (
    !checkedIn &&
    assigned &&
    assignStatus !== 'declined' &&
    assignStatus !== 'pending_talent_confirm'
  ) {
    const onVisitDay = isVisitCheckInDay(assigned)
    const store = String(applicant.assignedVisitStore || '').trim() || '门店'
    const revised = !!String(applicant.visitScheduleRevisedAt || '').trim()
    const revisedNote = '商单探店时间已变更，请与PR沟通并重新调整探店时间'
    return {
      label: onVisitDay ? '待签到' : '待探店',
      showCheckInBtn: true,
      checkInReady: onVisitDay,
      showEditVisitBtn: true,
      editVisitMode: 'effective',
      visitScheduleRevised: revised,
      visitHint: revised
        ? `已确认排期 · ${assigned} · ${store}（${revisedNote}）`
        : onVisitDay
          ? `今日探店 · ${assigned} · ${store}`
          : `已确认排期 · ${assigned} · ${store}（探店日当天可签到）`,
    }
  }
  if (!checkedIn) {
    return {
      label: '待探店',
      visitHint: assigned
        ? `已确认排期 · ${assigned}（如需调整请联系招募方）`
        : '请留意 PR 排期通知',
    }
  }
  return { label: '已签到', visitHint: `签到时间 ${checkedIn}` }
}

function needsScheduleConfirm(applicant, isIce) {
  if (!applicant || isIce) return false
  if (isTalentScheduleIntentConfirmed(applicant)) return false
  if (String(applicant.taskStatus || '') === 'rejected') return false
  return true
}

function isScheduleSkipped(mp) {
  if (!mp || !mp.mpPublishMeta || typeof mp.mpPublishMeta !== 'object') return false
  const wf = mp.mpPublishMeta.prWorkflow
  return !!(wf && typeof wf === 'object' && String(wf.scheduleSkippedAt || '').trim())
}

function isTalentVisitCheckedIn(mp, applicant) {
  if (isScheduleSkipped(mp)) return true
  if (String((applicant && applicant.visitCheckInAt) || '').trim()) return true
  return String((applicant && applicant.visitStatus) || '').trim() === 'checked_in'
}

function canShowConfirmVisitBtn(mp, applicant) {
  if (!applicant || !isApplicantPrSelected(mp, applicant)) return false
  if (isTalentVisitCheckedIn(mp, applicant)) return false
  const assignStatus = String(applicant.visitAssignmentStatus || '').trim()
  if (assignStatus === 'pending_talent_confirm' || assignStatus === 'declined') return false
  if (!isPrScheduleEffective(applicant, mp) && !isScheduleSkipped(mp)) return false
  return !!String(applicant.assignedVisitAt || '').trim() || isScheduleSkipped(mp)
}

function isScriptOrder(mp) {
  return deliveryReview.isScriptReviewPlatform(mp && mp.platform)
}

function canTalentUploadRecruitmentVideo(mp, applicant, isIce) {
  if (isScriptOrder(mp)) return false
  if (isIce) return false
  if (!applicant || !isApplicantPrSelected(mp, applicant)) return false
  const skipped = isScheduleSkipped(mp)
  if (!skipped && !isTalentVisitCheckedIn(mp, applicant)) return false
  const videoStatus = String(applicant.videoStatus || '')
  const videoUrl = String(applicant.videoUrl || '').trim()
  if (videoStatus === 'pending' || videoStatus === 'passed' || videoStatus === 'draft') return false
  if (videoStatus === 'rejected' && videoUrl) return false
  return true
}

function canTalentSubmitRecruitmentVideo(mp, applicant, isIce) {
  if (isScriptOrder(mp)) return false
  if (isIce) return false
  if (!applicant || !isApplicantPrSelected(mp, applicant)) return false
  const skipped = isScheduleSkipped(mp)
  if (!skipped && !isTalentVisitCheckedIn(mp, applicant)) return false
  const videoStatus = String(applicant.videoStatus || '')
  const videoUrl = String(applicant.videoUrl || '').trim()
  if (!videoUrl) return false
  return videoStatus === 'draft' || videoStatus === 'rejected'
}

function canTalentReuploadRecruitmentVideo(mp, applicant, isIce) {
  return canTalentSubmitRecruitmentVideo(mp, applicant, isIce)
}

function canTalentUploadRecruitmentScript(mp, applicant, isIce) {
  if (!isScriptOrder(mp) || isIce) return false
  if (!applicant || !isApplicantPrSelected(mp, applicant)) return false
  const skipped = isScheduleSkipped(mp)
  if (!skipped && !isTalentVisitCheckedIn(mp, applicant)) return false
  const st = String(applicant.scriptStatus || '')
  const url = String(applicant.scriptUrl || applicant.scriptLinkUrl || '').trim()
  if (st === 'pending' || st === 'passed' || st === 'draft') return false
  if (st === 'rejected' && url) return false
  return true
}

function canTalentSubmitRecruitmentScript(mp, applicant, isIce) {
  if (!isScriptOrder(mp) || isIce) return false
  if (!applicant || !isApplicantPrSelected(mp, applicant)) return false
  const skipped = isScheduleSkipped(mp)
  if (!skipped && !isTalentVisitCheckedIn(mp, applicant)) return false
  const url = String(applicant.scriptUrl || applicant.scriptLinkUrl || '').trim()
  if (!url) return false
  const st = String(applicant.scriptStatus || '')
  return st === 'draft' || st === 'rejected'
}

function pendingScriptPhaseLabel(mp, applicant) {
  const st = String((applicant && applicant.scriptStatus) || '')
  if (st === 'draft') return '待提交'
  if (st === 'pending') return 'PR审核中'
  if (st === 'rejected') return '文稿已驳回'
  if (canTalentUploadRecruitmentScript(mp, applicant, false)) return '待传文稿'
  return '待传文稿'
}

function pendingVideoPhaseLabel(mp, applicant) {
  if (isScriptOrder(mp)) return pendingScriptPhaseLabel(mp, applicant)
  const visitPublish = resolveVisitPublishPhase(applicant)
  if (visitPublish === 'awaiting_link') return '待回传链接'
  if (visitPublish === 'ai_pending') return 'AI核查中'
  if (visitPublish === 'link_failed') return '链接未通过'
  const videoStatus = String((applicant && applicant.videoStatus) || '')
  if (videoStatus === 'draft') return '待提交'
  if (videoStatus === 'pending') return 'PR审核中'
  if (videoStatus === 'rejected') return '视频已驳回'
  if (canTalentUploadRecruitmentVideo(mp, applicant, false)) return '待传视频'
  return '待传视频'
}

function resolveIceContext(mp, mpOrderId) {
  if (isIceMpOrder(mp)) return true
  const orderId = String(mpOrderId || (mp && mp.id) || '').trim()
  return /^MP-ICE-/i.test(orderId)
}

function isPendingVideoPhase(mp, applicant, mpOrderId) {
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
  if (isScriptOrder(mp)) {
    const st = String(applicant.scriptStatus || '')
    if (isTalentVisitCheckedIn(mp, applicant) && !isApplicantPassed(applicant, false)) {
      if (st === 'passed') return false
      return true
    }
    if (canTalentSubmitRecruitmentScript(mp, applicant, false)) return true
    if (canTalentUploadRecruitmentScript(mp, applicant, false)) return true
    if (st === 'pending' || st === 'rejected') return true
    return false
  }
  const videoStatus = String(applicant.videoStatus || '')
  if (isTalentVisitCheckedIn(mp, applicant) && !isApplicantPassed(applicant, false)) {
    if (videoStatus === 'passed' && !resolveVisitPublishPhase(applicant)) return false
    return true
  }
  if (canTalentSubmitRecruitmentVideo(mp, applicant, false)) return true
  if (canTalentUploadRecruitmentVideo(mp, applicant, false)) return true
  if (videoStatus === 'pending' || videoStatus === 'rejected') return true
  if (resolveVisitPublishPhase(applicant)) return true
  if (/上传|审核|链接|回传/.test(progress.label)) return true
  return false
}

function resolveTalentApplicationProgress(mp, applicant, mpOrderId) {
  const ice = resolveIceContext(mp, mpOrderId)
  if (!applicant) {
    if (ice) return { id: 'in_progress', label: '进行中' }
    return { id: 'pr_pending', label: 'PR 待选中' }
  }

  if (ice) {
    const taskStatus = String(applicant.taskStatus || '')
    if (isApplicantPassed(applicant, true) && taskStatus === 'confirmed') {
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
      if (verifyMode === 'pr' && applicant.videoStatus === 'pending' && !isApplicantPassed(applicant, true)) {
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

  const visitPublish = resolveVisitPublishPhase(applicant)
  if (visitPublish === 'awaiting_link') return { id: 'in_progress', label: '待回传链接' }
  if (visitPublish === 'ai_pending') return { id: 'in_progress', label: 'AI 核查中' }
  if (visitPublish === 'link_failed') return { id: 'in_progress', label: '链接未通过' }

  if (isApplicantPassed(applicant, false)) return { id: 'completed', label: '已完成' }
  if (!isApplicantPrSelected(mp, applicant)) return { id: 'pr_pending', label: 'PR 待选中' }
  return { id: 'in_progress', label: '进行中' }
}

function resolveApplicationDisplayStatusCore(mp, applicant, mpOrderId, opts) {
  const options = opts || {}
  const isIce = options.isIce != null ? options.isIce : resolveIceContext(mp, mpOrderId)

  if (applicant && applicant.taskStatus === 'rejected') {
    return { tabId: 'cancelled', label: '已取消', tone: 'cancelled', showConfirmBtn: false }
  }

  const progress = resolveTalentApplicationProgress(mp, applicant, mpOrderId)
  if (progress.id === 'completed') {
    return { tabId: 'completed', label: '已完成', tone: 'completed', showConfirmBtn: false }
  }

  const prSelectedEarly = isApplicantPrSelected(mp, applicant)
  if (
    !isIce &&
    applicant &&
    prSelectedEarly &&
    isTalentVisitCheckedIn(mp, applicant) &&
    !isApplicantPassed(applicant, false)
  ) {
    return {
      tabId: 'pending_video',
      label: pendingVideoPhaseLabel(mp, applicant),
      tone: 'accepted',
      showConfirmBtn: false,
    }
  }

  if (isPendingVideoPhase(mp, applicant, mpOrderId)) {
    return { tabId: 'pending_video', label: pendingVideoPhaseLabel(mp, applicant), tone: 'accepted', showConfirmBtn: false }
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
  const notified = isApplicantSelectionNotified(mp, applicant, options.selectionNotified)

  if (!isIce && prSelected && notified && !isTalentScheduleIntentConfirmed(applicant)) {
    return {
      tabId: 'approved',
      label: '已通过',
      tone: 'accepted',
      showConfirmBtn: needsScheduleConfirm(applicant, isIce),
    }
  }

  if (!isIce && prSelected && notified && isTalentPreferenceSubmitted(applicant) && !isPrScheduleEffective(applicant, mp)) {
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

  if (!isIce && prSelected && notified && isPrScheduleEffective(applicant, mp)) {
    if (isTalentVisitCheckedIn(mp, applicant) && !isApplicantPassed(applicant, false)) {
      return {
        tabId: 'pending_video',
        label: pendingVideoPhaseLabel(mp, applicant),
        tone: 'accepted',
        showConfirmBtn: false,
      }
    }
    const visitExtras = resolveVisitDisplayExtras(applicant)
    if (isPendingVideoPhase(mp, applicant, mpOrderId)) {
      return { tabId: 'pending_video', label: pendingVideoPhaseLabel(mp, applicant), tone: 'accepted', showConfirmBtn: false }
    }
    return {
      tabId: 'pending_visit',
      label: visitExtras.label || '待探店',
      tone: 'accepted',
      showConfirmBtn: false,
      showAssignConfirmBtn: visitExtras.showAssignConfirmBtn,
      showCheckInBtn: visitExtras.showCheckInBtn,
      checkInReady: visitExtras.checkInReady,
      showConfirmVisitBtn: canShowConfirmVisitBtn(mp, applicant),
      showEditVisitBtn: visitExtras.showEditVisitBtn,
      editVisitMode: visitExtras.editVisitMode,
      visitHint: visitExtras.visitHint,
      visitScheduleRevised: visitExtras.visitScheduleRevised,
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

function isApplicantPassedForCancel(applicant, isIce) {
  if (!applicant) return false
  if (String(applicant.completedAt || '').trim()) return true
  if (isIce) {
    if (applicant.aiVerifyStatus === 'passed') return true
    if (applicant.videoStatus === 'passed' && String(applicant.douyinPublishUrl || '').trim()) return true
  }
  return false
}

function canTalentCancelMpApplication(mp, applicant, mpOrderId) {
  if (!mp || !applicant) return false
  if (String(applicant.taskStatus || '') === 'rejected') return false
  const isIce = isIceMpOrder(mp) || /^MP-ICE-/i.test(String(mpOrderId || mp.id || ''))
  if (isApplicantPassedForCancel(applicant, isIce)) return false
  if (isIce) {
    const taskStatus = String(applicant.taskStatus || '')
    if (taskStatus === 'confirmed') return false
    return (
      taskStatus === 'pending_confirm' ||
      taskStatus === 'applied' ||
      (!taskStatus && !String(applicant.assignedVideoDownloadUrl || '').trim())
    )
  }
  if (isApplicantPrSelected(mp, applicant)) return false
  if (isApplicantSelectionNotified(mp, applicant)) return false
  return true
}

function attachCancelBtn(status, mp, applicant, mpOrderId) {
  if (!status || status.tabId !== 'registered') return status
  if (canTalentCancelMpApplication(mp, applicant, mpOrderId || String((mp && mp.id) || ''))) {
    return { ...status, showCancelBtn: true }
  }
  return status
}

function resolveApplicationDisplayStatus(mp, applicant, mpOrderId, opts) {
  return attachCancelBtn(
    resolveApplicationDisplayStatusCore(mp, applicant, mpOrderId, opts),
    mp,
    applicant,
    mpOrderId,
  )
}

function canTalentCancelApplication(mp, applicant, mpOrderId, opts) {
  if (!applicant || !mp) return false
  const display = resolveApplicationDisplayStatusCore(mp, applicant, mpOrderId, opts)
  if (display.tabId !== 'registered') return false
  return canTalentCancelMpApplication(mp, applicant, mpOrderId || String(mp.id || ''))
}

function matchTalentApplicationTab(tabId, mp, applicant, mpOrderId, opts) {
  return resolveApplicationDisplayStatus(mp, applicant, mpOrderId, opts).tabId === tabId
}

function matchTalentApplicationProgress(progressId, mp, applicant, mpOrderId) {
  if (!progressId || progressId === 'all') return true
  return resolveTalentApplicationProgress(mp, applicant, mpOrderId).id === progressId
}

module.exports = {
  TALENT_APPLICATION_TABS,
  talentApplicationTabsForGroup,
  TALENT_APP_PROGRESS_FILTERS,
  isApplicantPrSelected,
  isApplicantSelectionNotified,
  isScheduleConfirmed,
  isTalentScheduleIntentConfirmed,
  isPrScheduleEffective,
  isVisitCheckInDay,
  isTalentVisitCheckedIn,
  canTalentUploadRecruitmentVideo,
  canTalentSubmitRecruitmentVideo,
  canTalentReuploadRecruitmentVideo,
  canTalentUploadRecruitmentScript,
  canTalentSubmitRecruitmentScript,
  canTalentSubmitVisitPublishLink,
  canTalentCancelApplication,
  resolveVisitPublishPhase,
  resolveTalentApplicationProgress,
  resolveApplicationDisplayStatus,
  matchTalentApplicationTab,
  matchTalentApplicationProgress,
}
