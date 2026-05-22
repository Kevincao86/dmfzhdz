const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')
const { PLATFORM_TABS } = require('../../utils/platformTokensMp.js')

Page({
  data: {
    platform: 'douyin',
    tabs: PLATFORM_TABS.filter((p) => ['douyin', 'meituan', 'xiaohongshu'].includes(p.id)),
    loading: false,
    err: '',
    items: [],
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
    const r = await feature.fetchMarketingActivities(this.data.platform, 'all')
    this.setData({
      loading: false,
      err: r.ok ? '' : r.message,
      items: r.ok ? r.items : [],
    })
  },
})
