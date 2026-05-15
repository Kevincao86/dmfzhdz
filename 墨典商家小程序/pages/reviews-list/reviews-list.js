const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const reviews = require('../../utils/reviewsMp.js')

const PLATS = [
  { id: 'douyin', label: '抖音' },
  { id: 'meituan', label: '美团' },
  { id: 'xhs', label: '小红书' },
]

Page({
  data: {
    erpOk: false,
    plats: PLATS,
    activePlat: 'douyin',
    sentiments: [
      { id: 'all', label: '全部' },
      { id: 'good', label: '好评' },
      { id: 'neutral', label: '中评' },
      { id: 'bad', label: '差评' },
    ],
    sentiment: 'all',
    replyTabs: [
      { id: 'all', label: '全部' },
      { id: 'unreplied', label: '待回复' },
      { id: 'replied', label: '已回复' },
    ],
    replyStatus: 'all',
    loading: false,
    errMsg: '',
    items: [],
    statsText: '',
    replyingId: '',
    replyDraft: '',
  },
  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const erpOk = merchant.hasMerchantApi()
    this.setData({ erpOk })
    if (erpOk) void this.load()
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh())
  },
  onPlat(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activePlat) return
    this.setData({ activePlat: id, replyingId: '', replyDraft: '' })
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
  async load() {
    if (!merchant.hasMerchantApi()) {
      this.setData({ loading: false, errMsg: '尚未连接电脑端商家后台，请联系技术人员。', items: [], statsText: '' })
      return
    }
    this.setData({ loading: true, errMsg: '' })
    const r = await reviews.fetchReviewsList(this.data.activePlat, this.data.sentiment, this.data.replyStatus)
    if (!r.ok) {
      this.setData({ loading: false, errMsg: r.message, items: [], statsText: '' })
      return
    }
    const items = (r.items || []).map((x) => ({
      id: String(x.id || ''),
      userName: String(x.userName || x.user_name || '匿名'),
      ratingStars: Number(x.ratingStars || x.rating_stars || 0) || 0,
      content: String(x.content || ''),
      createdAt: String(x.createdAt || x.created_at || ''),
      replied: Boolean(x.replied),
      replyText: String(x.replyText || x.reply_text || ''),
      sentiment: String(x.sentiment || ''),
    }))
    let statsText = ''
    if (r.stats && typeof r.stats === 'object') {
      const t = r.stats.total
      const u = r.stats.unreplied
      if (typeof t === 'number' && typeof u === 'number') {
        statsText = `共 ${t} 条 · 待回复 ${u}`
      }
    }
    this.setData({ loading: false, items, statsText })
  },
  startReply(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({
      replyingId: id,
      replyDraft: '',
    })
  },
  cancelReply() {
    this.setData({ replyingId: '', replyDraft: '' })
  },
  onReplyInput(e) {
    this.setData({ replyDraft: e.detail.value || '' })
  },
  async submitReply(e) {
    const id = e.currentTarget.dataset.id
    const text = String(this.data.replyDraft || '').trim()
    if (!id || !text) {
      wx.showToast({ title: '请输入回复内容', icon: 'none' })
      return
    }
    wx.showLoading({ title: '提交…', mask: true })
    const r = await reviews.postReviewReply(this.data.activePlat, id, text)
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
