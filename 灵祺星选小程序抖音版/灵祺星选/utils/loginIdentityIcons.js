/** 欢迎/登录身份 3D 图标：develop 用本地文件，体验版/正式版走 CDN（包内 ignore identity PNG） */
const mpCdnAssets = require('./mpCdnAssets.js')

const LOCAL_IDENTITY_ICON = {
  talent: '/images/identity/identity-talent.png',
  shoot: '/images/identity/identity-shoot.png',
  edit: '/images/identity/identity-edit.png',
  pr: '/images/identity/identity-pr.png',
}

function isDevelopPreview() {
  try {
    const info = wx.getAccountInfoSync()
    return info && info.miniProgram && info.miniProgram.envVersion === 'develop'
  } catch (_) {
    return true
  }
}

function loginIdentityIconLocal(id) {
  return LOCAL_IDENTITY_ICON[id] || LOCAL_IDENTITY_ICON.talent
}

function loginIdentityIconCdn(id) {
  return mpCdnAssets.identityIcon(id)
}

function loginIdentityIcon(id) {
  if (isDevelopPreview()) return loginIdentityIconLocal(id)
  return loginIdentityIconCdn(id)
}

function loginIdentityIconCdnFallback(id) {
  return loginIdentityIconCdn(id)
}

function attachLoginIdentityIcons(options) {
  return (options || []).map((item) => ({
    ...item,
    icon: loginIdentityIcon(item.id),
  }))
}

module.exports = {
  loginIdentityIcon,
  loginIdentityIconLocal,
  loginIdentityIconCdnFallback,
  attachLoginIdentityIcons,
}
