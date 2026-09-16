Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/functions/functions', text: '功能', icon: 'grid' },
      { pagePath: '/pages/dashboard/dashboard', text: '经营概览', icon: 'chart' },
      { pagePath: '/pages/ai-agent/ai-agent', text: '助手', icon: 'ai' },
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
