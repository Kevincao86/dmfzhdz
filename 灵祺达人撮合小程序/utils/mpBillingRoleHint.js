const userProfile = require('./userProfile.js')

/** 积分/配额计费身份：与履约 Web lingqi_mp_work_identity_v1 语义一致（小程序用 meoo_talent_identity_v1） */
function readMpBillingRoleHint() {
  const id = userProfile.readIdentity()
  if (id === 'pr' || id === 'talent' || id === 'shoot' || id === 'edit') return id
  return undefined
}

function billingRolePayload() {
  const role = readMpBillingRoleHint()
  return role ? { billingRole: role } : {}
}

module.exports = {
  readMpBillingRoleHint,
  billingRolePayload,
}
