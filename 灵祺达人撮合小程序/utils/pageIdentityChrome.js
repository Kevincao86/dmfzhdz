/** 子页面顶栏/背景随当前身份主题同步；已登录时拉取云端本机态 */
const identityTheme = require('./identityTheme.js')

function syncPageIdentity(page) {
  if (!page || typeof page.setData !== 'function') return
  identityTheme.applyToPage(page)
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

module.exports = { syncPageIdentity, prepareMineSubPage }
