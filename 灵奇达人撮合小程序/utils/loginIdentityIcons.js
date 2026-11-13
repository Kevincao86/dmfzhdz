/** 欢迎/登录身份 3D 图标：包内 images/identity 已 ignore，走 OSS/CDN 远程（见 mpCdnAssets.identityIcon） */
const mpCdnAssets = require('./mpCdnAssets.js')

function loginIdentityIcon(id) {
  return mpCdnAssets.identityIcon(id)
}

function loginIdentityIconCandidates(id) {
  return mpCdnAssets.identityIconCandidates(id)
}

function loginIdentityIconCdnFallback(id) {
  return mpCdnAssets.assetUrl(mpCdnAssets.identityIconRel(id))
}

function attachLoginIdentityIcons(options) {
  return (options || []).map((item) => ({
    ...item,
    icon: loginIdentityIcon(item.id),
  }))
}

module.exports = {
  loginIdentityIcon,
  loginIdentityIconCandidates,
  loginIdentityIconCdnFallback,
  attachLoginIdentityIcons,
}
