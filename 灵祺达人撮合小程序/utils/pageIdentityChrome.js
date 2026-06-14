/** 子页面顶栏/背景随当前身份主题同步 */
const identityTheme = require('./identityTheme.js')

function syncPageIdentity(page) {
  if (!page || typeof page.setData !== 'function') return
  identityTheme.applyToPage(page)
}

module.exports = { syncPageIdentity }
