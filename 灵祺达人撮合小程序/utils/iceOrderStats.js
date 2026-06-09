const { isIceMpOrder } = require('./iceOrderDetect.js')

function getIceVerifyMode(mp) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return String(meta.iceVerifyMode || meta.iceAuditMode || 'ai').trim().toLowerCase() === 'pr' ? 'pr' : 'ai'
}

function isIceApplicantCompleted(applicant) {
  if (!applicant) return false
  if (applicant.aiVerifyStatus === 'passed' || applicant.videoStatus === 'passed') return true
  return !!String(applicant.completedAt || '').trim()
}

function isIceApplicantClaimed(applicant) {
  if (!applicant || applicant.taskStatus === 'rejected') return false
  const ts = String(applicant.taskStatus || '')
  if (ts === 'pending_confirm' || ts === 'confirmed' || ts === 'applied') return true
  return !!String(applicant.appliedAt || '').trim()
}

function countIceOrderStats(mp) {
  const applicants = Array.isArray(mp && mp.applicants) ? mp.applicants : []
  let claimed = 0
  let completed = 0
  for (const a of applicants) {
    if (isIceApplicantCompleted(a)) {
      completed += 1
      claimed += 1
    } else if (isIceApplicantClaimed(a)) {
      claimed += 1
    }
  }
  return { claimed, completed }
}

function applicantTaskStatusLabel(applicant) {
  if (!applicant) return '—'
  if (isIceApplicantCompleted(applicant)) return '已完成'
  if (applicant.taskStatus === 'rejected') return '已拒绝'
  if (applicant.videoStatus === 'rejected') return '链接已驳回'
  if (applicant.aiVerifyStatus === 'failed') return 'AI 核查未通过'
  if (applicant.videoStatus === 'pending' || applicant.aiVerifyStatus === 'pending') return '待审核链接'
  if (applicant.taskStatus === 'confirmed') return '进行中'
  if (applicant.taskStatus === 'pending_confirm' || applicant.taskStatus === 'applied') return '待确认接收'
  return '已认领'
}

function canReviewIceLink(applicant, mp) {
  if (!applicant || getIceVerifyMode(mp) !== 'pr') return false
  const url = String(applicant.douyinPublishUrl || applicant.videoUrl || '').trim()
  if (!url) return false
  if (isIceApplicantCompleted(applicant)) return false
  return applicant.videoStatus === 'pending' || applicant.aiVerifyStatus === 'pending'
}

module.exports = {
  isIceMpOrder,
  getIceVerifyMode,
  isIceApplicantCompleted,
  isIceApplicantClaimed,
  countIceOrderStats,
  applicantTaskStatusLabel,
  canReviewIceLink,
}
