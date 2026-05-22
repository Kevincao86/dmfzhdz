const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')
const { PLATFORM_TABS } = require('../../utils/platformTokensMp.js')

Page({
  data: {
    mode: 'info',
    platform: 'douyin',
    tabs: PLATFORM_TABS.filter((p) => p.id !== 'jd'),
    loading: false,
    err: '',
    items: [],
  },
  onLoad(q) {
    const mode = q && q.mode === 'decoration' ? 'decoration' : 'info'
    wx.setNavigationBarTitle({
      title: mode === 'decoration' ? '店铺装修' : '店铺信息',
    })
    this.setData({ mode })
  },
  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.load()
  },
  onTab(e) {
    this.setData({ platform: e.currentTarget.dataset.id })
    void this.load()
  },
  async load() {
    this.setData({ loading: true, err: '' })
    const r = await feature.fetchStoresForPlatform(this.data.platform)
    this.setData({
      loading: false,
      err: r.ok ? '' : r.message,
      items: r.ok ? r.items : [],
    })
  },
})
