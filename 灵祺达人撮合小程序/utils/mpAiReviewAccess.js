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

function cellEnabled(val) {
  if (val === true) return true
  if (typeof val === 'number' && val > 0) return true
  return false
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

function membershipAiReviewEnabled(account) {
  const role = workRoleFromIdentity(userProfile.readIdentity())
  const planId = effectivePlanId(account)
  const member = memberStore.readMember()
  const prProfile = userProfile.readPrProfile()
  const storedPerms =
    role === 'pr'
      ? prProfile && prProfile.mpMembershipPermissions
      : member && member.mpMembershipPermissions
  const cells = mergePlanPermissions(role, planId, storedPerms)
  if (role === 'pr') {
    return cellEnabled(cells.ai_compliance_video) || cellEnabled(cells.ai_compliance_copy)
  }
  return cellEnabled(cells.ai_selfcheck_video) || cellEnabled(cells.ai_selfcheck_copy)
}

/** 运营开通 AI 审核子板块，或会员档位含文稿/成片自检配额 */
function canUseAiReviewFeature(account) {
  const acc = account || require('./auth.js').readAccount()
  if (prFeatureAccess.canUseAddonPerm(acc, 'aiReview')) return true
  if (prFeatureAccess.canUseAddonPerm(acc, 'aiVideoReview')) return true
  return membershipAiReviewEnabled(acc)
}

function canUseScriptReview(account) {
  const acc = account || require('./auth.js').readAccount()
  if (prFeatureAccess.canUseAddonPerm(acc, 'aiReview')) return true
  const role = workRoleFromIdentity(userProfile.readIdentity())
  const planId = effectivePlanId(acc)
  const member = memberStore.readMember()
  const prProfile = userProfile.readPrProfile()
  const storedPerms =
    role === 'pr'
      ? prProfile && prProfile.mpMembershipPermissions
      : member && member.mpMembershipPermissions
  const cells = mergePlanPermissions(role, planId, storedPerms)
  if (role === 'pr') return cellEnabled(cells.ai_compliance_copy)
  return cellEnabled(cells.ai_selfcheck_copy)
}

function canUseVideoReview(account) {
  const acc = account || require('./auth.js').readAccount()
  if (prFeatureAccess.canUseAddonPerm(acc, 'aiVideoReview')) return true
  const role = workRoleFromIdentity(userProfile.readIdentity())
  const planId = effectivePlanId(acc)
  const member = memberStore.readMember()
  const prProfile = userProfile.readPrProfile()
  const storedPerms =
    role === 'pr'
      ? prProfile && prProfile.mpMembershipPermissions
      : member && member.mpMembershipPermissions
  const cells = mergePlanPermissions(role, planId, storedPerms)
  if (role === 'pr') return cellEnabled(cells.ai_compliance_video)
  return cellEnabled(cells.ai_selfcheck_video)
}

module.exports = {
  canUseAiReviewFeature,
  canUseScriptReview,
  canUseVideoReview,
  membershipAiReviewEnabled,
}
