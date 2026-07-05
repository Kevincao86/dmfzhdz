const userProfile = require('./userProfile.js')
const memberStore = require('./talentMember.js')
const mpMembershipUi = require('./mpMembershipUi.js')
const { mergePlanPermissions } = require('./mpMembershipMatrixBuiltin.js')
const auth = require('./auth.js')

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

function canUseTargetedRecruit(account) {
  const acc = account || auth.readAccount()
  if (userProfile.readIdentity() !== 'pr') return false
  const prProfile = userProfile.readPrProfile()
  const planId = effectivePlanId(acc)
  const cells = mergePlanPermissions('pr', planId, prProfile && prProfile.mpMembershipPermissions)
  return cellEnabled(cells.targeted_recruit)
}

module.exports = { canUseTargetedRecruit }
