const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')

Page({
  data: { loading: false, err: '', items: [] },
  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.load()
  },
  async load() {
    this.setData({ loading: true, err: '' })
    const r = await feature.fetchLocalClues(1)
    this.setData({
      loading: false,
      err: r.ok ? '' : r.message,
      items: r.ok ? r.items : [],
    })
  },
})
