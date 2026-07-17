/**
 * 根据内置会员矩阵，为未开通的增值权限推荐「请升级至 XX 版本」。
 */
const matrixMod = require('./mpMembershipMatrixBuiltin.js')
const userProfile = require('./userProfile.js')

const TIER_ORDER = ['pro', 'flagship', 'enterprise']
const TIER_LABELS = {
  basic: '基础版',
  pro: '专业版',
  flagship: '旗舰版',
  enterprise: '企业版',
}

const PERM_TO_MATRIX_KEY = {
  shortvideo: 'addon_shortvideo',
  cloudEdit: 'addon_cloud_edit',
  digitalHuman: 'addon_digital_human',
  visualStudio: 'addon_visual_studio',
  brief: 'ai_brief_gen',
  aiReview: 'ai_compliance_copy',
  aiVideoReview: 'ai_compliance_video',
}

function cellEnabled(cell) {
  if (cell === true) return true
  if (typeof cell === 'number' && cell > 0) return true
  return false
}

function resolveRole(account) {
  const id = userProfile.readIdentity()
  if (id === 'pr' || id === 'talent' || id === 'shoot' || id === 'edit') return id
  const role = String((account && (account.membershipRole || account.role)) || '').toLowerCase()
  if (role === 'pr' || role === 'talent' || role === 'shoot' || role === 'edit') return role
  return 'pr'
}

function matrixForRole(role) {
  const m = matrixMod.MATRIX || matrixMod.default || {}
  return m[role] || m.pr || {}
}

/** @returns {string} 如「专业版」；找不到则「付费会员」 */
function suggestUpgradePlanLabel(account, perm) {
  const key = PERM_TO_MATRIX_KEY[perm]
  if (!key) return '付费会员'
  const role = resolveRole(account)
  const matrix = matrixForRole(role)
  for (let i = 0; i < TIER_ORDER.length; i += 1) {
    const tier = TIER_ORDER[i]
    const cells = matrix[tier] || {}
    if (cellEnabled(cells[key])) return TIER_LABELS[tier] || tier
  }
  return '付费会员'
}

function upgradeModalContent(account, perm, featureTitle) {
  const plan = suggestUpgradePlanLabel(account, perm)
  const name = featureTitle || '该功能'
  return {
    title: '请升级会员',
    content: `${name}需更高会员档位，请升级至${plan}后使用。`,
    confirmText: '去升级',
    cancelText: '取消',
    upgradeUrl: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership',
  }
}

function showUpgradeModal(account, perm, featureTitle) {
  const m = upgradeModalContent(account, perm, featureTitle)
  wx.showModal({
    title: m.title,
    content: m.content,
    confirmText: m.confirmText,
    cancelText: m.cancelText,
    success(res) {
      if (res.confirm) {
        wx.navigateTo({ url: m.upgradeUrl }).catch(() => {})
      }
    },
  })
}

module.exports = {
  TIER_LABELS,
  PERM_TO_MATRIX_KEY,
  suggestUpgradePlanLabel,
  upgradeModalContent,
  showUpgradeModal,
}
