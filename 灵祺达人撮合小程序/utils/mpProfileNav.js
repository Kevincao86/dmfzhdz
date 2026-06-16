/**
 * 进入「我的信息」：跳转资料页，在用户点击「重新定位」时触发 wx.getLocation 原生授权
 */
const auth = require('./auth.js')
const guestRoutes = require('./mpGuestRoutes.js')
const regionAutoLocate = require('./regionAutoLocate.js')

const DEFAULT_URL = '/pages/register/register?edit=1'

function goMyProfile(url, opts) {
  const target = String(url || DEFAULT_URL).trim() || DEFAULT_URL
  const nav = opts && opts.replace ? wx.redirectTo.bind(wx) : wx.navigateTo.bind(wx)

  if (!auth.isLoggedIn()) {
    guestRoutes.redirectToLogin(target, opts)
    return
  }

  if (regionAutoLocate.fuzzyLocationEnabled()) {
    regionAutoLocate.markProfileLocateOnEnter()
  }
  nav({ url: target })
}

module.exports = {
  DEFAULT_URL,
  goMyProfile,
}
