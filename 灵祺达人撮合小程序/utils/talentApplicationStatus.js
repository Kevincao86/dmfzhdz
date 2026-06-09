const { isIceMpOrder } = require('./iceOrderDetect.js')

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

function resolveTalentApplicationProgress(mp, applicant) {
  if (!applicant) return { id: 'pr_pending', label: 'PR 待选中' }
  if (isApplicantPassed(applicant)) return { id: 'completed', label: '已完成' }

  const ice = isIceMpOrder(mp)
  if (ice) {
    const taskStatus = String(applicant.taskStatus || '')
    if (taskStatus === 'pending_confirm' || (!taskStatus && !applicant.assignedVideoDownloadUrl)) {
      return { id: 'in_progress', label: '进行中' }
    }
    if (taskStatus === 'confirmed') {
      const link = String(applicant.douyinPublishUrl || '').trim()
      const pendingReview =
        applicant.aiVerifyStatus === 'pending' ||
        applicant.videoStatus === 'pending' ||
        (link && applicant.aiVerifyStatus !== 'passed' && applicant.videoStatus !== 'passed')
      if (pendingReview) return { id: 'in_progress', label: '进行中' }
      if (!link) return { id: 'in_progress', label: '进行中' }
    }
    if (taskStatus === 'rejected') return { id: 'pr_pending', label: 'PR 待选中' }
    return { id: 'in_progress', label: '进行中' }
  }

  if (!isApplicantPrSelected(mp, applicant)) return { id: 'pr_pending', label: 'PR 待选中' }
  return { id: 'in_progress', label: '进行中' }
}

function matchTalentApplicationProgress(progressId, mp, applicant) {
  if (!progressId || progressId === 'all') return true
  return resolveTalentApplicationProgress(mp, applicant).id === progressId
}

module.exports = {
  TALENT_APP_PROGRESS_FILTERS,
  resolveTalentApplicationProgress,
  matchTalentApplicationProgress,
}
