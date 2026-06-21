const userProfile = require('./userProfile.js')
const chatBadgeWatcher = require('./chatBadgeWatcher.js')
const { getTabList, routeToPagePath } = require('./tabBarConfig.js')

function syncTabBarList(page) {
  if (!page || typeof page.getTabBar !== 'function') return null
  const bar = page.getTabBar()
  if (!bar) return null
  const list = getTabList(userProfile.readIdentity())
  const hasCenterFab = list.some((item) => item && item.center)
  bar.setData({ list, hasCenterFab })
  return bar
}

/** 按页面路径高亮 Tab（自动同步身份对应的 Tab 列表） */
function setTabBarForPage(page, pagePath) {
  const bar = syncTabBarList(page)
  if (!bar) return
  const idx = (bar.data.list || []).findIndex((i) => i.pagePath === pagePath)
  if (idx >= 0) bar.setData({ selected: idx })
  void refreshChatTabBadge(page)
}

/** 更新消息 Tab 未读角标（私信会话合计） */
async function refreshChatTabBadge(page, explicitCount) {
  void page
  await chatBadgeWatcher.refreshNow({
    explicitCount: typeof explicitCount === 'number' ? explicitCount : undefined,
    clearOverride: true,
  })
  chatBadgeWatcher.syncBarFromGlobal()
}

/** 身份切换等场景：刷新 Tab 列表并尽量保持当前页高亮 */
function refreshTabBar() {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  if (!page) return
  const bar = syncTabBarList(page)
  if (!bar) return
  const path = routeToPagePath(page.route)
  const idx = (bar.data.list || []).findIndex((i) => i.pagePath === path)
  if (idx >= 0) bar.setData({ selected: idx })
  void chatBadgeWatcher.refreshNow({ clearOverride: true })
  try {
    require('./identityTheme.js').syncTabBar()
  } catch (_) {}
}

/** 弹窗/全屏层打开时隐藏自定义 TabBar（避免遮挡底部 sheet） */
function setTabBarHidden(page, hidden) {
  if (!page || typeof page.getTabBar !== 'function') return
  const bar = page.getTabBar()
  if (bar) bar.setData({ hidden: !!hidden })
}

module.exports = {
  setTabBarForPage,
  refreshTabBar,
  refreshChatTabBadge,
  syncTabBarList,
  setTabBarHidden,
}
