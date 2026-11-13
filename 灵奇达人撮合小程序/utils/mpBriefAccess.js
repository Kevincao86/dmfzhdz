const prFeatureAccess = require('./prFeatureAccess.js')
const userProfile = require('./userProfile.js')
const memberStore = require('./talentMember.js')
const mpMembershipUi = require('./mpMembershipUi.js')
const { mergePlanPermissions } = require('./mpMembershipMatrixBuiltin.js')

function workRoleFromIdentity(identity) {
  const id = String(identity || '').trim()
  if (id === 'pr' || id === 'shoot' || id === 'edit') return id
  return 'talent'
}

function effectivePlanId(account) {
  const identity = userProfile.readIdentity()
  const member = memberStore.readMember()
  const prProfile = userProfile.readPrProfile()
  const stored = mpMembershipUi.readMembershipPlanId(account, identity, member, prProfile)
  const expiresAt = mpMembershipUi.readMembershipExpiresAt(account, identity, member, prProfile)
  if (stored !== 'basic' && expiresAt) {
    const d = new Date(expiresAt)
    if (!Number.isNaN(d.getTime()) && d.getTime() < Date.now()) return 'basic'
  }
  return stored || 'basic'
}

function membershipBriefEnabled(account) {
  const role = workRoleFromIdentity(userProfile.readIdentity())
  const planId = effectivePlanId(account)
  const member = memberStore.readMember()
  const prProfile = userProfile.readPrProfile()
  const storedPerms =
    role === 'pr'
      ? prProfile && prProfile.mpMembershipPermissions
      : member && member.mpMembershipPermissions
  const cells = mergePlanPermissions(role, planId, storedPerms)
  return cells.ai_brief_gen === true
}

/** 会员档位 ai_brief_gen 或运营开通 brief 子板块 */
function canUseBriefFeature(account) {
  if (prFeatureAccess.canUseAddonPerm(account, 'brief')) return true
  return membershipBriefEnabled(account)
}

module.exports = {
  canUseBriefFeature,
  membershipBriefEnabled,
}
