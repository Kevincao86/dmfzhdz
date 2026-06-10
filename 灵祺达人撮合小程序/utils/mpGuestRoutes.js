/** 登录拦截与游客浏览（报名 / 沟通 / 我的信息等需登录能力） */

const GUEST_BROWSE_KEY = 'mp_guest_browse_v1'

function normalizePath(path) {
  return String(path || '')
    .replace(/^\//, '')
    .split('?')[0]
    .trim()
}

function enterGuestBrowse() {
  try {
    wx.setStorageSync(GUEST_BROWSE_KEY, '1')
  } catch (_) {}
}

function clearGuestBrowse() {
  try {
    wx.removeStorageSync(GUEST_BROWSE_KEY)
  } catch (_) {}
}

function isGuestBrowsing() {
  try {
    return wx.getStorageSync(GUEST_BROWSE_KEY) === '1'
  } catch {
    return false
  }
}

function redirectToLogin(redirectUrl, opts) {
  const target = String(redirectUrl || '').trim()
  const url = target
    ? `/pages/login/login?redirect=${encodeURIComponent(target)}`
    : '/pages/login/login'
  if (opts && opts.replace) {
    wx.redirectTo({ url })
    return
  }
  wx.navigateTo({ url })
}

module.exports = {
  GUEST_BROWSE_KEY,
  normalizePath,
  enterGuestBrowse,
  clearGuestBrowse,
  isGuestBrowsing,
  redirectToLogin,
}
