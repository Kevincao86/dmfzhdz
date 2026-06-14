/** 子页面顶栏/背景随当前身份主题同步；已登录时拉取云端本机态 */
const identityTheme = require('./identityTheme.js')

const PR_THEME_CLASS = 'lq-theme-pr'

function syncPageIdentity(page) {
  if (!page || typeof page.setData !== 'function') return
  identityTheme.applyToPage(page)
}

/** PR 专属子页：固定紫色主题，避免先闪全局蓝色顶栏 */
function syncPrPageChrome(page, opts) {
  if (!page || typeof page.setData !== 'function') return
  const t = identityTheme.pack('pr')
  page.setData({
    lqThemeClass: PR_THEME_CLASS,
    credCheckboxColor: t.primary,
  })
  identityTheme.applyChrome('pr', opts)
}

async function prepareMineSubPage(page) {
  syncPageIdentity(page)
  if (!page || typeof page.setData !== 'function') return false
  try {
    const auth = require('./auth.js')
    if (!auth.isLoggedIn()) {
      page.setData({ mineGuestMode: true })
      return false
    }
    page.setData({ mineGuestMode: false })
    await require('./mpAccountClientSync.js').ensureClientStatePulled()
    return true
  } catch (_) {
    const loggedIn = require('./auth.js').isLoggedIn()
    page.setData({ mineGuestMode: !loggedIn })
    return loggedIn
  }
}

module.exports = { syncPageIdentity, syncPrPageChrome, prepareMineSubPage }
