Component({
  data: {
    selected: 0,
    hidden: false,
    lqAccentClass: '',
    lqPageStyle: '',
    list: [
      { pagePath: '/pages/dashboard/dashboard', text: '首页', icon: 'chart' },
      { pagePath: '/pages/ai-agent/ai-agent', text: '助手', icon: 'ai' },
      { pagePath: '/pages/shop-eval/shop-eval', text: '门店评估', icon: 'insight' },
      { pagePath: '/pages/functions/functions', text: '功能', icon: 'grid' },
      { pagePath: '/pages/mine/mine', text: '我的', icon: 'user' },
    ],
  },
  lifetimes: {
    attached() {
      this.syncSplash()
    },
  },
  pageLifetimes: {
    show() {
      this.syncSplash()
    },
  },
  methods: {
    syncSplash() {
      const pages = getCurrentPages()
      const route = pages.length ? String(pages[pages.length - 1].route || '') : ''
      let splash = false
      try {
        splash = getApp().globalData.launchSplash === true
      } catch (_) {}
      const hidden = route === 'pages/dashboard/dashboard' && splash
      if (hidden !== this.data.hidden) this.setData({ hidden })
    },
    switchTab(e) {
      const idx = Number(e.currentTarget.dataset.index)
      const item = this.data.list[idx]
      if (!item) return
      wx.switchTab({ url: item.pagePath })
    },
  },
})
