/** 未登录时跳转登录页（报名 / 达人沟通 / 我的信息等需登录能力） */

function normalizePath(path) {
  return String(path || '')
    .replace(/^\//, '')
    .split('?')[0]
    .trim()
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
  normalizePath,
  redirectToLogin,
}
