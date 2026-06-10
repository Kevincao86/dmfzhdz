/** 未登录可访问的页面（群聊短链商单详情、游客浏览 Tab 等） */
const GUEST_PATHS = new Set([
  'pages/detail/detail',
  'pages/login/login',
  'pages/index/index',
  'pages/recommend/recommend',
  'pages/publish/publish',
  'pages/messages/messages',
  'pages/mine/mine',
  'pages/legal/legal',
])

const GUEST_BROWSE_KEY = 'mp_guest_browse_v1'

function normalizePath(path) {
  return String(path || '')
    .replace(/^\//, '')
    .split('?')[0]
    .trim()
}

function resolveLaunchPath() {
  try {
    const opts = wx.getLaunchOptionsSync()
    return normalizePath(opts.path)
  } catch {
    return ''
  }
}

function isGuestAllowedPath(path) {
  const p = normalizePath(path)
  return GUEST_PATHS.has(p)
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

function canBrowseWithoutLogin(path) {
  return isGuestAllowedPath(path) || isGuestBrowsing()
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

function currentRoutePath() {
  const pages = getCurrentPages()
  if (!pages.length) return resolveLaunchPath()
  return normalizePath(pages[pages.length - 1].route)
}

module.exports = {
  GUEST_PATHS,
  GUEST_BROWSE_KEY,
  normalizePath,
  resolveLaunchPath,
  isGuestAllowedPath,
  enterGuestBrowse,
  clearGuestBrowse,
  isGuestBrowsing,
  canBrowseWithoutLogin,
  redirectToLogin,
  currentRoutePath,
}
