Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/functions/functions', text: '功能', icon: 'grid' },
      { pagePath: '/pages/agent/agent', text: '灵祺助手', icon: 'ai' },
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
