const { syncPrPageChrome } = require('../../utils/pageIdentityChrome.js')

Page({
  data: {
    mpOrderId: '',
    title: '',
    talentCount: 0,
    lqThemeClass: 'lq-theme-pr',
  },
  onLoad(options) {
    syncPrPageChrome(this, { animate: false })
    this.setData({
      mpOrderId: String((options && options.id) || '').trim(),
      title: decodeURIComponent(String((options && options.title) || '')),
      talentCount: Number((options && options.count) || 0) || 0,
    })
  },
  onShow() {
    syncPrPageChrome(this, { animate: false })
  },
  goVideoReview() {
    wx.navigateTo({
      url: `/pages/mine-pr-orders/mine-pr-orders?tab=pending_video_review`,
    })
  },
  goApplicants() {
    const id = this.data.mpOrderId
    if (!id) return
    wx.navigateTo({
      url: `/pages/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(id)}`,
    })
  },
  goOrders() {
    wx.navigateTo({ url: '/pages/mine-pr-orders/mine-pr-orders?tab=pending_schedule' })
  },
})
