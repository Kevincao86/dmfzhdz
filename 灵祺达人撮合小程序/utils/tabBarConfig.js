const prFeatureAccess = require('./prFeatureAccess.js')
const sessionStore = require('./mpSessionStore.js')

/** 底部 Tab：随 PR / 达人身份切换（达人隐藏「发招募」，达人账号分析始终展示） */
function getTabList(identity) {
  const isPr = identity === 'pr'
  const analysisUnlocked = talentAnalysisUnlocked()
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
  } else if (identity === 'talent') {
    list.push({
      pagePath: '/pages/subpack-mine/mine-local-life-eval/mine-local-life-eval',
      text: '达人账号分析',
      icon: 'insight',
      navigate: true,
      compact: true,
      upgradeFeature: analysisUnlocked ? '' : '达人账号分析',
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

function talentAnalysisUnlocked(account) {
  const talentAccess = prFeatureAccess.readAccountPrFeatureAccess(account || sessionStore.readAccount())
  return talentAccess.talentEval === true || talentAccess.talentAdvice === true
}

function promptMembershipUpgrade(featureTitle) {
  const name = featureTitle || '该功能'
  wx.showModal({
    title: '请升级会员',
    content: `${name}需更高会员档位，请升级至专业版后使用。`,
    confirmText: '去升级',
    cancelText: '取消',
    success(res) {
      if (!res.confirm) return
      wx.navigateTo({
        url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership',
      }).catch(() => {})
    },
  })
}

module.exports = {
  getTabList,
  routeToPagePath,
  talentAnalysisUnlocked,
  promptMembershipUpgrade,
}
