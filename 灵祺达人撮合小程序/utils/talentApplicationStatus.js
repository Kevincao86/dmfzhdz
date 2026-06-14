const { isIceMpOrder } = require('./iceOrderDetect.js')
const { getIceVerifyMode } = require('./iceOrderStats.js')

const TALENT_APPLICATION_TABS = [
  { id: 'registered', label: '已报名' },
  { id: 'approved', label: '已通过' },
  { id: 'pending_visit', label: '待探店' },
  { id: 'pending_video', label: '待传视频' },
  { id: 'completed', label: '已完成' },
  { id: 'cancelled', label: '已取消' },
]

const TALENT_APP_PROGRESS_FILTERS = [
  { id: 'all', label: '全部状态' },
  { id: 'pr_pending', label: 'PR 待选中' },
  { id: 'in_progress', label: '进行中' },
  { id: 'completed', label: '已完成' },
]

function isApplicantPassed(applicant) {
  if (!applicant) return false
  if (applicant.aiVerifyStatus === 'passed') return true
  if (applicant.videoStatus === 'passed') return true
  if (String(applicant.completedAt || '').trim()) return true
  return false
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

function isPrScheduleEffective(applicant) {
  if (!applicant) return false
  const st = String(applicant.visitAssignmentStatus || '').trim()
  return st === 'confirmed' && !!String(applicant.assignedVisitAt || '').trim()
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
  if (!checkedIn && assignStatus === 'confirmed' && assigned) {
    const onVisitDay = isVisitCheckInDay(assigned)
    const store = String(applicant.assignedVisitStore || '').trim() || '门店'
    return {
      label: onVisitDay ? '待签到' : '待探店',
      showCheckInBtn: true,
      checkInReady: onVisitDay,
      visitHint: onVisitDay
        ? `今日探店 · ${assigned} · ${store}（如需调整排期请联系招募方）`
        : `探店时间 · ${assigned} · ${store}（探店日当天可签到；如需调整排期请联系招募方）`,
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

function canTalentUploadRecruitmentVideo(mp, applicant, isIce) {
  if (isIce) return false
  if (!applicant || !isApplicantPrSelected(mp, applicant)) return false
  if (!String(applicant.visitCheckInAt || '').trim()) return false
  const videoStatus = String(applicant.videoStatus || '')
  return !videoStatus || videoStatus === 'rejected'
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
  const videoStatus = String(applicant.videoStatus || '')
  if (canTalentUploadRecruitmentVideo(mp, applicant, false)) return true
  if (videoStatus === 'pending' || videoStatus === 'rejected') return true
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

function resolveApplicationDisplayStatus(mp, applicant, mpOrderId, opts) {
  const options = opts || {}
  const isIce = options.isIce != null ? options.isIce : resolveIceContext(mp, mpOrderId)

  if (applicant && applicant.taskStatus === 'rejected') {
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
  const notified = isApplicantSelectionNotified(mp, applicant, options.selectionNotified)

  if (!isIce && prSelected && notified && !isTalentScheduleIntentConfirmed(applicant)) {
    return {
      tabId: 'approved',
      label: '已通过',
      tone: 'accepted',
      showConfirmBtn: needsScheduleConfirm(applicant, isIce),
    }
  }

  if (!isIce && prSelected && notified && isTalentPreferenceSubmitted(applicant) && !isPrScheduleEffective(applicant)) {
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
      checkInReady: visitExtras.checkInReady,
      showEditVisitBtn: visitExtras.showEditVisitBtn,
      editVisitMode: visitExtras.editVisitMode,
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

function matchTalentApplicationTab(tabId, mp, applicant, mpOrderId, opts) {
  return resolveApplicationDisplayStatus(mp, applicant, mpOrderId, opts).tabId === tabId
}

function matchTalentApplicationProgress(progressId, mp, applicant, mpOrderId) {
  if (!progressId || progressId === 'all') return true
  return resolveTalentApplicationProgress(mp, applicant, mpOrderId).id === progressId
}

module.exports = {
  TALENT_APPLICATION_TABS,
  TALENT_APP_PROGRESS_FILTERS,
  isApplicantPrSelected,
  isApplicantSelectionNotified,
  isScheduleConfirmed,
  isTalentScheduleIntentConfirmed,
  isPrScheduleEffective,
  isVisitCheckInDay,
  canTalentUploadRecruitmentVideo,
  resolveTalentApplicationProgress,
  resolveApplicationDisplayStatus,
  matchTalentApplicationTab,
  matchTalentApplicationProgress,
}
