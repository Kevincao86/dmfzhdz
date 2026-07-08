const { MODULE_COPY } = require('../../utils/mpModules.js')

Page({
  data: {
    body: '',
    key: '',
    navTitle: '功能',
  },
  onLoad(options) {
    const k = (options.k || '').trim()
    const m = MODULE_COPY[k]
    if (!m) {
      wx.setNavigationBarTitle({ title: '功能' })
      this.setData({
        key: k,
        navTitle: '提示',
        body: k ? `暂无「${k}」说明，请从工作台重新进入。` : '缺少参数，请从工作台进入。',
      })
      return
    }
    wx.setNavigationBarTitle({ title: m.navTitle })
    this.setData({ key: k, body: m.body, navTitle: m.navTitle })
  },
})
