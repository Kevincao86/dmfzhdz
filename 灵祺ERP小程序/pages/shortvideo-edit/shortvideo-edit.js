const api = require('../../utils/api.js')

Page({
  data: {
    hook: '',
    outline: '',
    durationSec: '',
    tags: '',
    cta: '',
    rawText: '',
  },
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
  onLoad() {
    const d = wx.getStorageSync('meoo_draft_shortvideo') || {}
    this.setData({
      hook: d.hook || '',
      outline: d.outline || '',
      durationSec: d.durationSec || '',
      tags: d.tags || '',
      cta: d.cta || '',
      rawText: d.rawText || '',
    })
  },
  onField(e) {
    const k = e.currentTarget.dataset.k
    if (k) this.setData({ [k]: e.detail.value })
  },
  onSubmit() {
    wx.setStorageSync('meoo_last_shortvideo_submit', {
      hook: this.data.hook,
      outline: this.data.outline,
      durationSec: this.data.durationSec,
      tags: this.data.tags,
      cta: this.data.cta,
    })
    wx.showModal({
      title: '已保存草稿',
      content: '草稿已保存在本机。正式任务与诊断请在电脑端「短视频优化」中继续。',
      showCancel: false,
    })
  },
})
