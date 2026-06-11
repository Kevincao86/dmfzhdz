const { isIceMpOrder, isEditTeamIceMpOrder } = require('./iceOrderDetect.js')

const ICE_APPLICANT_STORAGE_PREFIX = 'meoo_ice_applicant_v1_'

function iceApplicantStorageKey(mpOrderId) {
  return `${ICE_APPLICANT_STORAGE_PREFIX}${String(mpOrderId || '').trim()}`
}

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

function countIceClaimedSlots(mp, recruitCap) {
  const slots = Array.isArray(mp && mp.iceVideoSlots) ? mp.iceVideoSlots : []
  const total = slots.length || Math.max(0, Number(recruitCap) || 0)
  if (!total) return { claimed: 0, total: 0 }

  if (isEditTeamIceMpOrder(mp)) {
    let claimed = 0
    const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
    for (const a of applicants) {
      if (!a || a.taskStatus === 'rejected') continue
      const ts = String(a.taskStatus || '')
      const assignedN = Array.isArray(a.assignedIceSlotIds) ? a.assignedIceSlotIds.length : 0
      if (ts === 'confirmed' || assignedN > 0) {
        claimed += assignedN || Math.max(1, Number.parseInt(String(a.claimedSlotCount || 1), 10) || 1)
      } else if ((ts === 'pending_confirm' || ts === 'applied' || !ts) && String(a.appliedAt || '').trim()) {
        claimed += Math.max(1, Number.parseInt(String(a.claimedSlotCount || 1), 10) || 1)
      }
    }
    if (!claimed) {
      claimed = slots.filter((s) => String(s.assignedApplicantId || '').trim()).length
    }
    return { claimed, total }
  }

  const assigned = slots.filter((s) => String(s.assignedApplicantId || '').trim()).length
  if (assigned > 0) return { claimed: assigned, total }
  return { claimed: countIceOrderStats(mp).claimed, total }
}

function buildHallSignupCountText(mp, applicantCount, recruitCap) {
  return buildSignupProgressLabel(mp, applicantCount, recruitCap, 'hall')
}

function buildSignupProgressLabel(mp, applicantCount, recruitCap, style) {
  const hall = style === 'hall'
  if (!isIceMpOrder(mp)) {
    const cap = recruitCap > 0 ? recruitCap : hall ? '不限' : '—'
    return hall ? `报名${applicantCount}/${cap}` : `报名 ${applicantCount}/${cap} 人`
  }
  const { claimed, total } = countIceClaimedSlots(mp, recruitCap)
  const cap = total > 0 ? total : recruitCap > 0 ? recruitCap : hall ? '不限' : '—'
  return hall ? `认领${claimed}/${cap}` : `认领 ${claimed}/${cap} 条`
}

module.exports = {
  isIceMpOrder,
  getIceVerifyMode,
  isIceApplicantCompleted,
  isIceApplicantClaimed,
  countIceOrderStats,
  countIceClaimedSlots,
  buildHallSignupCountText,
  buildSignupProgressLabel,
  applicantTaskStatusLabel,
  canReviewIceLink,
  iceApplicantStorageKey,
}
