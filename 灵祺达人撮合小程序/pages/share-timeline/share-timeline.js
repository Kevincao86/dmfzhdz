/** 旧引导页：重定向到详情，避免从此页分享时打开 share-timeline 而非 detail */
Page({
  onLoad(options) {
    const id = String(options && options.id ? decodeURIComponent(options.id) : '').trim()
    if (!id) {
      wx.showToast({ title: '缺少招募单号', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    wx.redirectTo({
      url: `/pages/detail/detail?id=${encodeURIComponent(id)}&timelineGuide=1`,
    })
  },
})
