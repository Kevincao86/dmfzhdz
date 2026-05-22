const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const listing = require('../../utils/productListingMp.js')
const { PLATFORM_TABS } = require('../../utils/platformTokensMp.js')

Page({
  data: {
    erpOk: false,
    tabs: PLATFORM_TABS,
    activePlat: 'douyin',
    keyword: '',
    loading: false,
    errMsg: '',
    note: '',
    items: [],
    displayItems: [],
    syncingId: '',
    hintBanner:
      '请先在「系统设置」完成各平台授权。',
  },
  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const erpOk = merchant.hasMerchantApi()
    this.setData({ erpOk })
    if (erpOk) void this.loadList()
  },
  onPullDownRefresh() {
    void this.loadList().finally(() => wx.stopPullDownRefresh())
  },
  onTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activePlat) return
    this.setData({ activePlat: id, keyword: '' })
    void this.loadList()
  },
  onKeyword(e) {
    const keyword = (e.detail.value || '').trim().toLowerCase()
    this.setData({ keyword })
    this.applyFilter(keyword)
  },
  applyFilter(kw) {
    const items = this.data.items || []
    if (!kw) {
      this.setData({ displayItems: items })
      return
    }
    const displayItems = items.filter((x) => String(x.name || '').toLowerCase().includes(kw))
    this.setData({ displayItems })
  },
  async loadList() {
    if (!merchant.hasMerchantApi()) {
      this.setData({
        loading: false,
        errMsg: '尚未连接商家后台',
        note: '',
        items: [],
        displayItems: [],
      })
      return
    }
    this.setData({ loading: true, errMsg: '', note: '' })
    const r = await listing.fetchMerchantProductList(this.data.activePlat, { page: 1, pageSize: 50 })
    if (!r.ok) {
      this.setData({
        loading: false,
        errMsg: r.message,
        note: '',
        items: [],
        displayItems: [],
      })
      return
    }
    const items = r.items || []
    const kw = (this.data.keyword || '').trim().toLowerCase()
    const displayItems = kw ? items.filter((x) => String(x.name || '').toLowerCase().includes(kw)) : items
    this.setData({
      loading: false,
      items,
      displayItems,
      note: r.message || '',
    })
  },
  goCreate() {
    wx.navigateTo({ url: '/pages/product-create/product-create' })
  },
  goVoice() {
    wx.navigateTo({ url: '/pages/product-voice/product-voice' })
  },
  onOpenItem(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    if (!id) return
    wx.setStorageSync('meoo_product_pick', {
      id,
      name,
      platform: this.data.activePlat,
      pickedAt: Date.now(),
    })
    wx.navigateTo({ url: '/pages/product-edit/product-edit' })
  },
  async onSync(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.syncingId) return
    if (this.data.activePlat !== 'douyin') {
      wx.showToast({ title: '当前仅抖音支持同步', icon: 'none' })
      return
    }
    this.setData({ syncingId: id })
    const r = await listing.postMerchantProductSyncDouyin(id)
    this.setData({ syncingId: '' })
    if (r.ok) {
      wx.showToast({ title: r.message || '已同步', icon: 'success' })
      void this.loadList()
    } else {
      wx.showModal({ title: '同步失败', content: r.message || '未知错误', showCancel: false })
    }
  },
})
