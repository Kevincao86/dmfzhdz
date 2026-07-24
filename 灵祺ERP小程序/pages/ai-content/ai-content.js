const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const douyin = require('../../utils/douyinGoodsMp.js')
const aiOperation = require('../../utils/aiOperationMp.js')

const PLATFORM_OPTIONS = [
  { id: 'douyin', label: '抖音来客', disabled: false },
  { id: 'meituan', label: '美团点评', disabled: true },
  { id: 'xhs', label: '小红书', disabled: true },
]

Page({
  data: {
    mainTab: 'article',

    platformOptions: PLATFORM_OPTIONS,
    platformIdx: 0,
    platformWarn: '',

    scopeMode: 'brand',
    brandName: '',

    storeSheet: false,
    storeRows: [],
    selectedStores: [],
    selSummary: '尚未选择',

    articleBrief: '',
    articleOut: '',
    articleErr: '',
    articleBusy: false,

    topicFocus: '',
    topicOut: '',
    topicErr: '',
    topicBusy: false,

    modelUi: '智能 · qwen（与 Web 「自动文案模型」对齐）',
  },

  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
    this.syncPlatformWarn()
  },

  syncPlatformWarn() {
    const p = PLATFORM_OPTIONS[this.data.platformIdx]
    let w = ''
    if (p && p.id !== 'douyin') w = '内容生成能力当前仅接通「抖音来客」，其它平台占位与电脑端一致。'
    else if (!douyin.douyinToken()) w = '未检测到抖音来客绑定，将无法返回正文。'
    this.setData({ platformWarn: w })
  },

  buildContextProductName() {
    const p = PLATFORM_OPTIONS[this.data.platformIdx] || PLATFORM_OPTIONS[0]
    const plat = p.label
    if (p.id !== 'douyin') {
      return `${plat}（当前仅抖音来客支持内容生成）`
    }
    if (this.data.scopeMode === 'brand')
      return `${plat}；品牌：${String(this.data.brandName || '').trim() || '（未填写）'}`
    const sel = Array.isArray(this.data.selectedStores) ? this.data.selectedStores : []
    if (!sel.length) return `${plat}；门店：（未选择）`
    const names = sel.map((x) => x.name).join('、')
    return `${plat}；门店：${names}（共 ${sel.length} 家）`
  },

  async ensureDouyinAiReady() {
    if (!merchant.hasMerchantApi()) {
      wx.showModal({ title: '未连接后台', content: '请先配置商家后台网关地址（MERCHANT_API_BASE_URL）。', showCancel: false })
      return false
    }
    const p = PLATFORM_OPTIONS[this.data.platformIdx]
    if (p.id !== 'douyin') {
      wx.showToast({ title: '请选择抖音来客', icon: 'none' })
      return false
    }
    if (!douyin.douyinToken()) {
      wx.showToast({ title: '请绑定抖音来客', icon: 'none' })
      return false
    }
    return true
  },

  switchMain(e) {
    const t = e.currentTarget.dataset.t
    if (!t || t === this.data.mainTab) return
    this.setData({ mainTab: t })
  },

  toggleScope(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.scopeMode) return
    this.setData({ scopeMode: mode })
  },

  onPlatformChange(e) {
    const ix = Number(e.detail.value)
    this.setData({ platformIdx: ix }, () => this.syncPlatformWarn())
  },

  onBrand(e) {
    this.setData({ brandName: e.detail.value })
  },

  refreshStorePickUi() {
    const sel = this.data.selectedStores || []
    const set = new Set(sel.map((x) => x.id))
    const rows = (this.data.storeRows || []).map((r) =>
      Object.assign({}, r, { _pick: set.has(r.id) }),
    )
    this.setData({ storeRows: rows })
  },

  async openStorePick() {
    if (!merchant.hasMerchantApi()) return wx.showToast({ title: '未连接后台', icon: 'none' })
    const ok = PLATFORM_OPTIONS[this.data.platformIdx].id === 'douyin'
    if (!ok) return wx.showToast({ title: '仅抖音可查门店列表', icon: 'none' })
    wx.showLoading({ title: '加载…', mask: true })
    const r = await douyin.fetchDouyinStores()
    wx.hideLoading()
    if (!r.ok) return wx.showModal({ title: '门店读取失败', content: r.message, showCancel: false })
    const rows =
      Array.isArray(r.items) && r.items.length
        ? r.items
        : []
    if (!rows.length) return wx.showToast({ title: '暂无门店数据', icon: 'none' })
    const sel = this.data.selectedStores || []
    const set = new Set(sel.map((x) => x.id))
    const decorated = rows.map((row) => Object.assign({}, row, { _pick: set.has(row.id) }))
    this.setData({ storeRows: decorated, storeSheet: true })
  },

  closeStorePick() {
    this.setData({ storeSheet: false })
  },

  noop() {},

  onToggleStore(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const name = String(e.currentTarget.dataset.name || '')
    let sel = (this.data.selectedStores || []).slice()
    const hit = sel.findIndex((x) => x.id === id)
    if (hit >= 0) sel.splice(hit, 1)
    else sel.push({ id, name })
    if (sel.length > 12) {
      wx.showToast({ title: '最多选12家（小程序）', icon: 'none' })
      return
    }
    const summary =
      sel.length === 0
        ? '尚未选择'
        : sel.length <= 2
          ? sel.map((x) => x.name).join('、')
          : `${sel
              .slice(0, 2)
              .map((x) => x.name)
              .join('、')} 等${sel.length}家`
    this.setData({
      selectedStores: sel,
      selSummary: summary,
    })
    this.refreshStorePickUi()
  },

  onArticleBrief(e) {
    this.setData({ articleBrief: e.detail.value })
  },

  onTopicFocus(e) {
    this.setData({ topicFocus: e.detail.value })
  },

  async submitArticle() {
    if (!(await this.ensureDouyinAiReady())) return
    if (this.data.scopeMode === 'brand') {
      if (String(this.data.brandName || '').trim().length < 2) {
        return wx.showToast({ title: '请填写品牌名', icon: 'none' })
      }
    } else if (!this.data.selectedStores.length) {
      return wx.showToast({ title: '请选择门店', icon: 'none' })
    }
    const brief = String(this.data.articleBrief || '').trim()
    if (brief.length < 8) return wx.showToast({ title: '写作要点至少8字', icon: 'none' })
    this.setData({ articleBusy: true, articleErr: '', articleOut: '' })
    const r = await aiOperation.postAiOperationAssist('operation_article', {
      productContextName: this.buildContextProductName(),
      titleDraft: brief,
      model: 'qwen',
    })
    this.setData({ articleBusy: false })
    if (!r.ok) this.setData({ articleErr: r.message })
    else this.setData({ articleOut: r.text })
  },

  async submitTopic() {
    if (!(await this.ensureDouyinAiReady())) return
    if (this.data.scopeMode === 'brand') {
      if (String(this.data.brandName || '').trim().length < 2) return wx.showToast({ title: '请填写品牌名', icon: 'none' })
    } else if (!this.data.selectedStores.length) return wx.showToast({ title: '请选择门店', icon: 'none' })
    const t = String(this.data.topicFocus || '').trim()
    if (t.length < 8) return wx.showToast({ title: '选题背景至少8字', icon: 'none' })
    this.setData({ topicBusy: true, topicErr: '', topicOut: '' })
    const r = await aiOperation.postAiOperationAssist('operation_topic', {
      productContextName: this.buildContextProductName(),
      titleDraft: t,
      model: 'qwen',
    })
    this.setData({ topicBusy: false })
    if (!r.ok) this.setData({ topicErr: r.message })
    else this.setData({ topicOut: r.text })
  },

  copyArticle() {
    if (!this.data.articleOut) return
    wx.setClipboardData({
      data: this.data.articleOut,
      success() {
        wx.showToast({ title: '已复制' })
      },
    })
  },

  copyTopic() {
    if (!this.data.topicOut) return
    wx.setClipboardData({
      data: this.data.topicOut,
      success() {
        wx.showToast({ title: '已复制' })
      },
    })
  },
})
