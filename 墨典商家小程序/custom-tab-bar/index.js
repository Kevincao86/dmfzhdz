Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/agent/agent', text: '墨典AI' },
      { pagePath: '/pages/functions/functions', text: '功能' },
      { pagePath: '/pages/mine/mine', text: '我的' },
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
