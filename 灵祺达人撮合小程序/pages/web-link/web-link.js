Page({
  data: { url: '' },
  onLoad(query) {
    const raw = query && query.url ? decodeURIComponent(String(query.url)) : ''
    if (!/^https?:\/\//i.test(raw)) {
      wx.showToast({ title: '链接无效', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({ url: raw })
  },
})
