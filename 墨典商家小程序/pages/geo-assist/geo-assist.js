const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')

Page({
  data: { brief: '', out: '', err: '', busy: false },
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
  onBrief(e) {
    this.setData({ brief: e.detail.value })
  },
  async onGenerate() {
    const brief = (this.data.brief || '').trim()
    if (brief.length < 4) {
      wx.showToast({ title: '请补充门店与品类信息', icon: 'none' })
      return
    }
    this.setData({ busy: true, err: '', out: '' })
    const r = await feature.postAiAssist('geo_keywords', brief)
    this.setData({ busy: false })
    if (!r.ok) {
      this.setData({ err: r.message })
      return
    }
    this.setData({ out: r.text })
  },
})
