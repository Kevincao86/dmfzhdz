Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/agent/agent', text: '墨典AI', icon: 'ai' },
      { pagePath: '/pages/functions/functions', text: '功能', icon: 'grid' },
      { pagePath: '/pages/mine/mine', text: '我的', icon: 'user' },
    ],
  },
  methods: {
    switchTab(e) {
      const idx = Number(e.currentTarget.dataset.index)
      const item = this.data.list[idx]
      if (!item) return
      wx.switchTab({ url: item.pagePath })
    },
  },
})
