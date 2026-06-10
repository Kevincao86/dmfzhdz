const { isIceMpOrder } = require('./iceOrderDetect.js')
const { getIceVerifyMode } = require('./iceOrderStats.js')

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

/** 探店/拍摄类：PR 确认选择（审核通过）后才可上传成片 */
function canTalentUploadRecruitmentVideo(mp, applicant, isIce) {
  if (isIce) return false
  if (!applicant || !isApplicantPrSelected(mp, applicant)) return false
  const progress = resolveTalentApplicationProgress(mp, applicant, mp && mp.id)
  if (progress.id === 'pr_pending') return false
  const videoStatus = String(applicant.videoStatus || '')
  return !videoStatus || videoStatus === 'rejected'
}

function resolveIceContext(mp, mpOrderId) {
  if (isIceMpOrder(mp)) return true
  const orderId = String(mpOrderId || (mp && mp.id) || '').trim()
  return /^MP-ICE-/i.test(orderId)
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
    if (taskStatus === 'pending_confirm' || taskStatus === 'applied' || (!taskStatus && !applicant.assignedVideoDownloadUrl)) {
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
        return { id: 'in_progress', label: applicant.videoStatus === 'rejected' ? '链接已驳回' : 'AI 核查未通过' }
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

function matchTalentApplicationProgress(progressId, mp, applicant, mpOrderId) {
  if (!progressId || progressId === 'all') return true
  return resolveTalentApplicationProgress(mp, applicant, mpOrderId).id === progressId
}

module.exports = {
  TALENT_APP_PROGRESS_FILTERS,
  isApplicantPrSelected,
  canTalentUploadRecruitmentVideo,
  resolveTalentApplicationProgress,
  matchTalentApplicationProgress,
}
