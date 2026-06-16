/** 欢迎/登录页身份图标：CDN/OSS（images/identity 不打包，控制主包 <2MB） */
const mpCdnAssets = require('./mpCdnAssets.js')

function loginIdentityIcon(id) {
  return mpCdnAssets.identityIcon(id)
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
