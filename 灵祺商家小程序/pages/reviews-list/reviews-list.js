const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const reviews = require('../../utils/reviewsMp.js')
const douyin = require('../../utils/douyinGoodsMp.js')
const { PLATFORM_TABS } = require('../../utils/platformTokensMp.js')

const AI_KEY = 'meoo_mp_reviews_ai_auto_v1'

const PLAT_UI = PLATFORM_TABS.map((p) => ({
  id: p.id,
  label: p.label,
  soon: p.id === 'jd',
  api:
    p.id === 'douyin'
      ? 'douyin'
      : p.id === 'kuaishou'
        ? 'kuaishou'
        : p.id === 'meituan'
          ? 'meituan'
          : p.id === 'xiaohongshu'
            ? 'xhs'
            : p.id === 'eleme'
              ? 'eleme'
              : p.id === 'meituan_waimai'
                ? 'meituan_waimai'
                : p.id === 'jd_waimai'
                  ? 'jd_waimai'
                  : null,
}))

Page({
  data: {
    erpOk: false,
    platUi: PLAT_UI,
    activePlatTab: 'douyin',
    reviewKindTabs: [
      { id: 'store', label: '门店评价' },
      { id: 'product', label: '商品评价' },
    ],
    reviewKind: 'store',
    sentiments: [
      { id: 'all', label: '全部' },
      { id: 'good', label: '好评' },
      { id: 'neutral', label: '中评' },
      { id: 'bad', label: '差评' },
    ],
    sentiment: 'all',
    replyTabs: [
      { id: 'all', label: '全部', cnt: '0' },
      { id: 'unreplied', label: '待回复', cnt: '0' },
      { id: 'replied', label: '已回复', cnt: '0' },
    ],
    replyStatus: 'all',
    aiAutoReply: false,
    syncing: false,
    loading: false,
    errMsg: '',
    syncedAtText: '',
    items: [],
    replyingId: '',
    replyDraft: '',
    suggestBusyId: '',
    storePickerLabels: ['全部门店'],
    storePickerIndex: 0,
    storesInternal: [{ id: '', name: '全部门店' }],
  },

  readAiToggle() {
    try {
      return Boolean(wx.getStorageSync(AI_KEY))
    } catch (_) {
      return false
    }
  },

  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const erpOk = merchant.hasMerchantApi()
    this.setData({ erpOk, aiAutoReply: this.readAiToggle() })
    if (erpOk) void this.maybeLoadStores()
    if (erpOk) void this.load()
  },

  async maybeLoadStores() {
    if (this.data.activePlatTab !== 'douyin' || this.data.reviewKind !== 'store') return
    const r = await douyin.fetchDouyinStores()
    if (!r.ok || !r.items?.length) {
      this.setData({
        storePickerLabels: ['全部门店'],
        storePickerIndex: 0,
        storesInternal: [{ id: '', name: '全部门店' }],
      })
      return
    }
    const labels = ['全部门店', ...r.items.map((x) => x.name.slice(0, 32))]
    const storesInternal = [{ id: '', name: '全部门店' }, ...r.items.map((x) => ({ id: x.id, name: x.name }))]
    this.setData({
      storePickerLabels: labels,
      storesInternal,
      storePickerIndex: 0,
    })
  },

  kindTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.reviewKind) return
    this.setData({ reviewKind: id })
    void this.maybeLoadStores()
    void this.load()
  },

  onPlat(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activePlatTab) return
    const row = PLAT_UI.find((x) => x.id === id)
    if (row && row.soon) {
      wx.showToast({ title: '即将支持', icon: 'none' })
      return
    }
    if (row && !row.api) {
      wx.showToast({ title: '当前平台不可用', icon: 'none' })
      return
    }
    this.setData({ activePlatTab: id, replyingId: '', replyDraft: '' })
    void this.maybeLoadStores()
    void this.load()
  },

  onStorePick(e) {
    const i = Number(e.detail.value) || 0
    this.setData({ storePickerIndex: i })
    void this.load()
  },

  onSent(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.sentiment) return
    this.setData({ sentiment: id })
    void this.load()
  },

  onReplyTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.replyStatus) return
    this.setData({ replyStatus: id })
    void this.load()
  },

  onAiToggle(e) {
    const next = Boolean(e.detail.value)
    try {
      wx.setStorageSync(AI_KEY, next)
    } catch (_) {}
    this.setData({ aiAutoReply: next })
  },

  activeApiPlatform() {
    const row = PLAT_UI.find((x) => x.id === this.data.activePlatTab)
    return row && row.api ? row.api : 'douyin'
  },

  currentPoiId() {
    if (this.data.reviewKind !== 'store') return ''
    const row = this.data.storesInternal[this.data.storePickerIndex]
    return row && row.id ? row.id : ''
  },

  async load() {
    if (!merchant.hasMerchantApi()) {
      this.setData({ loading: false, errMsg: '尚未连接商家后台', items: [], syncedAtText: '' })
      this.patchReplyTabCounts(0, 0, 0)
      return
    }
    const plat = this.activeApiPlatform()
    this.setData({ loading: true, errMsg: '' })
    const r = await reviews.fetchReviewsList(plat, this.data.sentiment, this.data.replyStatus, {
      kind: this.data.reviewKind,
      poiId: this.currentPoiId(),
    })
    if (!r.ok) {
      this.setData({
        loading: false,
        errMsg: r.message,
        items: [],
        syncedAtText: '',
      })
      return
    }
    const stats = r.stats
    if (stats && typeof stats.total === 'number')
      this.patchReplyTabCounts(stats.total, stats.unreplied || 0, stats.replied || 0)
    else this.patchReplyTabCounts(0, 0, 0)

    const items = (r.items || []).map((x) => ({
      id: String(x.id || ''),
      userName: String(x.userName || x.user_name || '匿名'),
      ratingStars: Number(x.ratingStars || x.rating_stars || 0) || 0,
      content: String(x.content || ''),
      createdAt: String(x.createdAt || x.created_at || ''),
      replied: Boolean(x.replied),
      replyText: String(x.replyText || x.reply_text || ''),
      sentiment: String(x.sentiment || ''),
      poiLabel: String(x.poiName || ''),
      prodLabel: String(x.productName || ''),
    }))
    const syncedAtText = r.syncedAt ? `上次同步：${r.syncedAt}` : '可先「同步评价」拉取开放平台数据'
    this.setData({ loading: false, items, syncedAtText })
  },

  patchReplyTabCounts(total, unr, rep) {
    this.setData({
      replyTabs: [
        { id: 'all', label: '全部', cnt: String(total ?? 0) },
        { id: 'unreplied', label: '待回复', cnt: String(unr ?? 0) },
        { id: 'replied', label: '已回复', cnt: String(rep ?? 0) },
      ],
    })
  },

  async onSync() {
    if (!merchant.hasMerchantApi()) return
    const plat = this.activeApiPlatform()
    this.setData({ syncing: true })
    wx.showLoading({ title: '同步中…', mask: true })
    const r = await reviews.postReviewsSync(plat, {
      kind: this.data.reviewKind,
      poiId: this.currentPoiId(),
    })
    wx.hideLoading()
    this.setData({ syncing: false })
    if (!r.ok) {
      wx.showModal({ title: '同步失败', content: r.message, showCancel: false })
      return
    }
    wx.showToast({ title: r.message || '已同步', icon: 'success' })
    void this.load()
  },

  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh())
  },

  startReply(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ replyingId: id, replyDraft: '' })
  },

  cancelReply() {
    this.setData({ replyingId: '', replyDraft: '' })
  },

  onReplyInput(e) {
    this.setData({ replyDraft: e.detail.value || '' })
  },

  async onAiSuggest(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ suggestBusyId: id })
    const r = await reviews.postReviewAiSuggest(this.activeApiPlatform(), id)
    this.setData({ suggestBusyId: '' })
    if (!r.ok) {
      wx.showToast({ title: r.message.slice(0, 18), icon: 'none' })
      return
    }
    this.setData({
      replyingId: id,
      replyDraft: String(r.text || '').slice(0, 500),
    })
  },

  async submitReply(e) {
    const id = e.currentTarget.dataset.id
    const text = String(this.data.replyDraft || '').trim()
    if (!id || !text) {
      wx.showToast({ title: '请输入回复内容', icon: 'none' })
      return
    }
    wx.showLoading({ title: '提交…', mask: true })
    const r = await reviews.postReviewReply(this.activeApiPlatform(), id, text)
    wx.hideLoading()
    if (!r.ok) {
      wx.showModal({ title: '回复失败', content: r.message, showCancel: false })
      return
    }
    this.setData({ replyingId: '', replyDraft: '' })
    wx.showToast({ title: '已回复', icon: 'success' })
    void this.load()
  },
})
