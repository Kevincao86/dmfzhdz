const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')

Page({
  data: { tab: 'article', brief: '', out: '', err: '', busy: false },
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.t, out: '', err: '' })
  },
  onBrief(e) {
    this.setData({ brief: e.detail.value })
  },
  async onGenerate() {
    const brief = (this.data.brief || '').trim()
    if (brief.length < 4) {
      wx.showToast({ title: '请先填写需求', icon: 'none' })
      return
    }
    const scene = this.data.tab === 'topic' ? 'operation_topic' : 'operation_article'
    this.setData({ busy: true, err: '', out: '' })
    const r = await feature.postAiAssist(scene, brief)
    this.setData({ busy: false })
    if (!r.ok) {
      this.setData({ err: r.message })
      return
    }
    this.setData({ out: r.text })
  },
  onCopy() {
    if (!this.data.out) return
    wx.setClipboardData({
      data: this.data.out,
      success() {
        wx.showToast({ title: '已复制' })
      },
    })
  },
})
