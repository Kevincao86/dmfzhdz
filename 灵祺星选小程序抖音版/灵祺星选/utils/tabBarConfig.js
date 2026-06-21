/** 底部 Tab：随 PR / 达人身份切换（达人隐藏「发招募」） */
function getTabList(identity) {
  const isPr = identity === 'pr'
  const list = [
    { pagePath: '/pages/index/index', text: '首页', icon: 'home' },
    {
      pagePath: '/pages/recommend/recommend',
      text: '推荐大厅',
      icon: 'star',
      aiBadge: true,
    },
  ]
  if (isPr) {
    list.push({
      pagePath: '/pages/publish/publish',
      text: '发招募',
      icon: 'plus',
      center: true,
    })
  }
  list.push(
    { pagePath: '/pages/messages/messages', text: '消息', icon: 'chat' },
    { pagePath: '/pages/mine/mine', text: '我的', icon: 'user' },
  )
  return list
}

function routeToPagePath(route) {
  if (!route) return ''
  return route.startsWith('/') ? route : `/${route}`
}

module.exports = {
  getTabList,
  routeToPagePath,
}
