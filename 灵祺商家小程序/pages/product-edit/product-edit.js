const api = require('../../utils/api.js')

Page({
  data: {
    categoryName: '',
    productType: '',
    title: '',
    subtitle: '',
    priceHint: '',
    tags: '',
    rawText: '',
  },
  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
    }
  },
  onLoad() {
    const d = wx.getStorageSync('meoo_draft_product') || {}
    let title = d.title || ''
    try {
      const pick = wx.getStorageSync('meoo_product_pick') || {}
      const pname = typeof pick.name === 'string' ? pick.name.trim() : ''
      if (pname && !title) title = pname
    } catch (_) {}
    this.setData({
      categoryName: d.categoryName || '',
      productType: d.productType || '',
      title,
      subtitle: d.subtitle || '',
      priceHint: d.priceHint || '',
      tags: d.tags || '',
      rawText: d.rawText || '',
    })
  },
  onField(e) {
    const k = e.currentTarget.dataset.k
    if (!k) return
    this.setData({ [k]: e.detail.value })
  },
  onSubmit() {
    const payload = {
      categoryName: this.data.categoryName,
      productType: this.data.productType,
      title: this.data.title,
      subtitle: this.data.subtitle,
      priceHint: this.data.priceHint,
      tags: this.data.tags,
    }
    wx.setStorageSync('meoo_last_product_submit', payload)
    wx.showModal({
      title: '已保存草稿',
      content: '草稿已保存在本机。完整上架请使用「功能 → 新建商品」提交至平台。',
      showCancel: false,
    })
  },
})
