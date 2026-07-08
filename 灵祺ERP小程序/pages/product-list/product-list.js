const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const listing = require('../../utils/productListingMp.js')
const douyin = require('../../utils/douyinGoodsMp.js')
const {
  LIST_TABS,
  STATUS_FILTERS,
  SORT_OPTIONS,
  PREVIEW_STORES,
  enrichProductRow,
  previewProducts,
  syncButtonLabel,
  applyFilters,
  shouldUsePreview,
} = require('../../utils/productListUiMp.js')

Page({
  data: {
    tabs: LIST_TABS,
    activePlat: 'douyin',
    keyword: '',
    loading: false,
    syncingAll: false,
    errMsg: '',
    note: '',
    items: [],
    displayItems: [],
    syncingId: '',
    syncBtnLabel: '同步至来客',
    statusFilters: STATUS_FILTERS,
    statusLabels: STATUS_FILTERS.map((x) => x.label),
    statusPickerIndex: 0,
    statusFilter: 'all',
    sortLabels: SORT_OPTIONS.map((x) => x.label),
    sortPickerIndex: 0,
    sortBy: 'default',
    storeLabels: PREVIEW_STORES.map((x) => x.name),
    storePickerIndex: 0,
    storesInternal: PREVIEW_STORES,
    storeId: '',
  },

  onShow() {
    if (!api.canAccessPage()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.setData({ syncBtnLabel: syncButtonLabel(this.data.activePlat) })
    if (shouldUsePreview()) {
      this.loadPreview()
      return
    }
    if (merchant.hasMerchantApi()) {
      void this.maybeLoadStores()
      void this.loadList()
    } else {
      this.setData({
        loading: false,
        errMsg: '尚未连接商家后台',
        items: [],
        displayItems: [],
      })
    }
  },

  onPullDownRefresh() {
    if (shouldUsePreview()) {
      this.loadPreview()
      wx.stopPullDownRefresh()
      return
    }
    void this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  onTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activePlat) return
    this.setData({
      activePlat: id,
      keyword: '',
      syncBtnLabel: syncButtonLabel(id),
    })
    if (shouldUsePreview()) {
      this.loadPreview()
      return
    }
    void this.maybeLoadStores()
    void this.loadList()
  },

  loadPreview() {
    const items = previewProducts(this.data.activePlat)
    this.applyAllFilters(items)
    this.setData({
      loading: false,
      errMsg: '',
      note: '预览模式 · 展示示例商品',
      storesInternal: PREVIEW_STORES,
      storeLabels: PREVIEW_STORES.map((x) => x.name),
    })
  },

  async maybeLoadStores() {
    if (this.data.activePlat !== 'douyin') {
      this.setData({
        storesInternal: [{ id: '', name: '全部门店' }],
        storeLabels: ['全部门店'],
        storePickerIndex: 0,
        storeId: '',
      })
      return
    }
    const r = await douyin.fetchDouyinStores()
    if (!r.ok || !r.items?.length) {
      this.setData({
        storesInternal: [{ id: '', name: '全部门店' }],
        storeLabels: ['全部门店'],
        storePickerIndex: 0,
        storeId: '',
      })
      return
    }
    const storesInternal = [{ id: '', name: '全部门店' }, ...r.items.map((x) => ({ id: x.id, name: x.name }))]
    this.setData({
      storesInternal,
      storeLabels: storesInternal.map((x) => x.name.slice(0, 18)),
      storePickerIndex: 0,
      storeId: '',
    })
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value || '' })
    this.applyAllFilters(this.data.items)
  },

  onStatusPick(e) {
    const i = Number(e.detail.value) || 0
    const row = STATUS_FILTERS[i] || STATUS_FILTERS[0]
    this.setData({ statusPickerIndex: i, statusFilter: row.id })
    this.applyAllFilters(this.data.items)
  },

  onSortPick(e) {
    const i = Number(e.detail.value) || 0
    const row = SORT_OPTIONS[i] || SORT_OPTIONS[0]
    this.setData({ sortPickerIndex: i, sortBy: row.id })
    this.applyAllFilters(this.data.items)
  },

  onStorePick(e) {
    const i = Number(e.detail.value) || 0
    const row = this.data.storesInternal[i] || { id: '', name: '全部门店' }
    this.setData({ storePickerIndex: i, storeId: row.id || '' })
    this.applyAllFilters(this.data.items)
  },

  applyAllFilters(items) {
    const displayItems = applyFilters(items, {
      keyword: this.data.keyword,
      statusFilter: this.data.statusFilter,
      storeId: this.data.storeId,
      sortBy: this.data.sortBy,
    })
    this.setData({ items, displayItems })
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
    const items = (r.items || []).map((x) => enrichProductRow(x, this.data.activePlat))
    this.applyAllFilters(items)
    this.setData({
      loading: false,
      note: r.message || '',
    })
  },

  onPullFromPlatform() {
    if (this.data.loading) return
    if (shouldUsePreview()) {
      this.loadPreview()
      wx.showToast({ title: '已刷新', icon: 'success' })
      return
    }
    wx.showLoading({ title: '拉取中…', mask: true })
    void this.loadList().then(() => {
      try {
        wx.hideLoading()
      } catch (_) {}
      if (this.data.errMsg) {
        wx.showToast({ title: String(this.data.errMsg).slice(0, 36), icon: 'none' })
      } else {
        wx.showToast({ title: '已从平台刷新', icon: 'success' })
      }
    })
  },

  onSyncPlatform() {
    if (this.data.syncingAll || this.data.loading) return
    if (this.data.activePlat !== 'douyin') {
      wx.showToast({ title: '当前平台请使用刷新列表', icon: 'none' })
      return
    }
    if (shouldUsePreview()) {
      wx.showToast({ title: '预览模式已模拟同步', icon: 'success' })
      return
    }
    const items = this.data.displayItems || []
    if (!items.length) {
      wx.showToast({ title: '暂无可同步商品', icon: 'none' })
      return
    }
    wx.showModal({
      title: '同步至来客',
      content: `将尝试同步当前列表前 ${Math.min(items.length, 5)} 条商品至抖音来客，是否继续？`,
      success: (res) => {
        if (res.confirm) void this.syncBatch(items.slice(0, 5))
      },
    })
  },

  async syncBatch(rows) {
    this.setData({ syncingAll: true })
    let ok = 0
    for (const row of rows) {
      const r = await listing.postMerchantProductSyncDouyin(row.id)
      if (r.ok) ok += 1
    }
    this.setData({ syncingAll: false })
    wx.showToast({ title: `已同步 ${ok}/${rows.length} 条`, icon: 'success' })
    void this.loadList()
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/product-create/product-create' })
  },

  onOpenItem(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    if (!id) return
    if (shouldUsePreview()) {
      wx.showToast({ title: '预览模式', icon: 'none' })
      return
    }
    wx.setStorageSync('meoo_product_pick', {
      id,
      name,
      platform: this.data.activePlat,
      pickedAt: Date.now(),
    })
    wx.navigateTo({ url: '/pages/product-edit/product-edit' })
  },

  onItemMenu(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    if (this.data.activePlat !== 'douyin') {
      this.onOpenItem(e)
      return
    }
    wx.showActionSheet({
      itemList: ['查看详情', '同步至来客'],
      success: (res) => {
        if (res.tapIndex === 0) this.onOpenItem(e)
        else if (res.tapIndex === 1) void this.onSync({ currentTarget: { dataset: { id } } })
      },
    })
  },

  async onSync(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.syncingId) return
    if (this.data.activePlat !== 'douyin') {
      wx.showToast({ title: '当前仅抖音支持同步', icon: 'none' })
      return
    }
    if (shouldUsePreview()) {
      wx.showToast({ title: '预览模式', icon: 'none' })
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
