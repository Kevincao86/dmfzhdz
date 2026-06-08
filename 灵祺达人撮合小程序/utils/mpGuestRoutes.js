/** 未登录可访问的页面（群聊短链直达商单详情等） */
const GUEST_PATHS = new Set([
  'pages/detail/detail',
  'pages/login/login',
])

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

function currentRoutePath() {
  const pages = getCurrentPages()
  if (!pages.length) return resolveLaunchPath()
  return normalizePath(pages[pages.length - 1].route)
}

module.exports = {
  GUEST_PATHS,
  normalizePath,
  resolveLaunchPath,
  isGuestAllowedPath,
  currentRoutePath,
}
