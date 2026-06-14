/** 欢迎/登录页身份图标 · 走 CDN/OSS（包内 images/identity 已 pack ignore） */
const mpCdnAssets = require('./mpCdnAssets.js')

function loginIdentityIcon(id) {
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
  attachLoginIdentityIcons,
}
