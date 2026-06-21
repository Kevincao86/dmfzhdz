const prFeatureAccess = require('./prFeatureAccess.js')
const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const mpFeatureFlags = require('./mpFeatureFlags.js')

const ALLOWED_IDENTITIES = new Set(['pr', 'talent', 'shoot', 'edit'])

/** 增值子页入口校验：功能开关 + 身份 + 运营开通 */
function ensureAddonPageAccess() {
  if (!mpFeatureFlags.ADDONS_NAV_VISIBLE) {
    wx.navigateBack()
    return false
  }
  const identity = userProfile.readIdentity()
  if (!ALLOWED_IDENTITIES.has(identity)) {
    wx.navigateBack()
    return false
  }
  if (!prFeatureAccess.canUsePrAddons(auth.readAccount())) {
    wx.showModal({
      title: '增值服务待开通',
      content: '需由灵祺运营在后台开通后方可使用。如有合作意向请联系灵祺运营。',
      showCancel: false,
      confirmText: '知道了',
      complete: () => wx.navigateBack(),
    })
    return false
  }
  return true
}

module.exports = {
  ensureAddonPageAccess,
}
