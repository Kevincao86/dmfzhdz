/** 欢迎/登录页身份图标：包内 3D 卡通优先（真机稳定），CDN/OSS 作回退 */
const mpCdnAssets = require('./mpCdnAssets.js')

const LOCAL_IDENTITY_ICON = {
  talent: '/images/identity/identity-talent.png',
  shoot: '/images/identity/identity-shoot.png',
  edit: '/images/identity/identity-edit.png',
  pr: '/images/identity/identity-pr.png',
}

function loginIdentityIcon(id) {
  return LOCAL_IDENTITY_ICON[id] || mpCdnAssets.identityIcon(id)
}

function loginIdentityIconCdnFallback(id) {
  return mpCdnAssets.identityIcon(id)
}

function attachLoginIdentityIcons(options) {
  return (options || []).map((item) => ({
    ...item,
    icon: loginIdentityIcon(item.id),
  }))
}

module.exports = {
  loginIdentityIcon,
  loginIdentityIconCdnFallback,
  attachLoginIdentityIcons,
}
