const applicationsStore = require('./applicationsStore.js')
const selection = require('./mpApplicantSelection.js')
const talentMember = require('./talentMember.js')
const talentPlatforms = require('./talentPlatformProfiles.js')

const ICE_APPLICANT_KEY = 'meoo_ice_applicant_v1_'

function localApplicantIdForOrder(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return ''
  const apps = applicationsStore.readApplications()
  const hit = apps.find((a) => a && String(a.mpOrderId || '') === id)
  if (hit && hit.applicantId) return String(hit.applicantId).trim()
  try {
    const ice = wx.getStorageSync(`${ICE_APPLICANT_KEY}_${id}`)
    if (ice) return String(ice).trim()
  } catch {
    /* ignore */
  }
  return ''
}

function applicantMatchesCurrentTalent(applicant) {
  const a = applicant || {}
  const member = talentMember.readMember()
  if (member && member.id && a.talentMemberId) {
    return String(a.talentMemberId).trim() === String(member.id).trim()
  }
  if (!member) return false
  const contact = String(member.contact || '').trim()
  if (contact && String(a.contact || '').trim() === contact) return true
  const plat = talentPlatforms.platformIdFromName(a.platform || '抖音')
  const prof = member.platformProfiles && member.platformProfiles[plat]
  const account = prof && String(prof.platformAccount || '').trim().toLowerCase()
  if (account && String(a.platformAccount || '').trim().toLowerCase() === account) return true
  return false
}

function findMyApplicant(mp, mpOrderId) {
  const applicants = Array.isArray(mp?.applicants) ? mp.applicants : []
  if (!applicants.length) return null
  const localId = localApplicantIdForOrder(mpOrderId)
  if (localId) {
    const byId = applicants.find((a) => a && String(a.id) === localId)
    if (byId) return byId
  }
  for (let i = 0; i < applicants.length; i++) {
    if (applicantMatchesCurrentTalent(applicants[i])) return applicants[i]
  }
  return null
}

/** @returns {{ canContact: boolean, hasApplication: boolean, reason: string, message: string, applicant: object|null }} */
function evaluate(mp, mpOrderId) {
  const applicant = findMyApplicant(mp, mpOrderId)
  if (!applicant) {
    return {
      canContact: false,
      hasApplication: false,
      reason: 'not_applied',
      message: '请先报名，招募方 PR 审核通过后方可联系',
      applicant: null,
    }
  }
  const selectedIds = selection.selectedIdsFromMp(mp)
  const approved = selectedIds.includes(String(applicant.id))
  if (!approved) {
    return {
      canContact: false,
      hasApplication: true,
      reason: 'pending_pr_review',
      message: '招募方 PR 尚未通过您的报名，在「我的招募」确认选择您之后方可联系',
      applicant,
    }
  }
  return {
    canContact: true,
    hasApplication: true,
    reason: 'approved',
    message: '',
    applicant,
  }
}

module.exports = {
  evaluate,
  findMyApplicant,
  localApplicantIdForOrder,
}
