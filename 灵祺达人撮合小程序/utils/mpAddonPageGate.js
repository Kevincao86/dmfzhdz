const prFeatureAccess = require('./prFeatureAccess.js')
const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const mpFeatureFlags = require('./mpFeatureFlags.js')
const mpBriefAccess = require('./mpBriefAccess.js')

const ALLOWED_IDENTITIES = new Set(['pr', 'talent', 'shoot', 'edit'])

/** 增值子页入口校验：功能开关 + 身份 + 运营开通子板块 */
function ensureAddonPageAccess(requiredPerm) {
  const account = auth.readAccount()
  const identity = userProfile.readIdentity()
  if (!ALLOWED_IDENTITIES.has(identity)) {
    wx.navigateBack()
    return false
  }

  if (requiredPerm === 'brief' && mpBriefAccess.canUseBriefFeature(account)) {
    return true
  }

  const bypassNavFlag =
    requiredPerm && prFeatureAccess.canUseAddonPerm(account, requiredPerm)
  if (!mpFeatureFlags.ADDONS_NAV_VISIBLE && !bypassNavFlag) {
    wx.navigateBack()
    return false
  }
  if (!prFeatureAccess.canUsePrAddons(account)) {
    wx.showModal({
      title: '增值服务待开通',
      content: '需由灵祺运营在后台开通后方可使用。如有合作意向请联系灵祺运营。',
      showCancel: false,
      confirmText: '知道了',
      complete: () => wx.navigateBack(),
    })
    return false
  }
  if (requiredPerm && !prFeatureAccess.canUseAddonPerm(account, requiredPerm)) {
    wx.showModal({
      title: '功能待开通',
      content: '该增值功能需由灵祺运营在后台开通后方可使用。如有合作意向请联系灵祺运营。',
      showCancel: false,
      confirmText: '知道了',
      complete: () => wx.navigateBack(),
    })
    return false
  }
  return true
}

/** 合并 AI 审核页：文稿或短视频任一开通即可进入 */
function ensureAiComplianceAddonAccess() {
  const account = auth.readAccount()
  const access = prFeatureAccess.readAccountPrFeatureAccess(account)
  if (access.aiReview) return ensureAddonPageAccess('aiReview')
  if (access.aiVideoReview) return ensureAddonPageAccess('aiVideoReview')
  return ensureAddonPageAccess('aiReview')
}

module.exports = {
  ensureAddonPageAccess,
  ensureAiComplianceAddonAccess,
}
