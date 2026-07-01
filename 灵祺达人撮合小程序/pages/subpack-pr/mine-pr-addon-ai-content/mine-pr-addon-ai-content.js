const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const addonApi = require('../../../utils/mpAddonMerchantApi.js')
const recruitOrders = require('../../../utils/mpAddonRecruitOrders.js')
const briefCompose = require('../../../utils/mpIceBriefCompose.js')

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    mainTab: 'article',
    textModel: 'qwen',
    textModels: addonApi.TEXT_MODELS,
    orderKeyword: '',
    orderRows: [],
    filteredOrders: [],
    selectedOrderId: '',
    selectedOrder: null,
    showOrderPicker: false,
    extraHint: '',
    articleOut: '',
    articleBusy: false,
    articleErr: '',
    topicOut: '',
    topicBusy: false,
    topicErr: '',
    briefOut: '',
    briefCopy: '',
    briefInstruction: '',
    briefBusy: false,
    briefErr: '',
  },
  onShow() {
    if (!mpAddonPageGate.ensureAddonPageAccess()) return
    this.reloadOrders()
  },
  async reloadOrders() {
    try {
      const rows = await recruitOrders.loadPrRecruitOrderPickerRows()
      this.setData({ orderRows: rows })
      this.applyOrderFilter(this.data.orderKeyword, rows, this.data.selectedOrderId)
    } catch (e) {
      wx.showToast({ title: '加载招募订单失败', icon: 'none' })
    }
  },
  applyOrderFilter(keyword, rows, selectedId) {
    const filtered = recruitOrders.filterRecruitOrders(rows || this.data.orderRows, keyword)
    const selectedOrder =
      (rows || this.data.orderRows).find((r) => r.id === selectedId) ||
      filtered.find((r) => r.id === selectedId) ||
      null
    this.setData({ filteredOrders: filtered, selectedOrder })
  },
  onTab(e) {
    this.setData({ mainTab: e.currentTarget.dataset.tab })
  },
  onModel(e) {
    this.setData({ textModel: e.currentTarget.dataset.id })
  },
  onOrderKeyword(e) {
    const orderKeyword = e.detail.value || ''
    this.setData({ orderKeyword })
    this.applyOrderFilter(orderKeyword, this.data.orderRows, this.data.selectedOrderId)
  },
  onToggleOrderPicker() {
    this.setData({ showOrderPicker: !this.data.showOrderPicker })
  },
  onPickOrder(e) {
    const id = e.currentTarget.dataset.id
    const selectedOrder = (this.data.orderRows || []).find((r) => r.id === id) || null
    this.setData({
      selectedOrderId: id,
      selectedOrder,
      showOrderPicker: false,
      orderKeyword: '',
    })
    this.applyOrderFilter('', this.data.orderRows, id)
  },
  onExtraHint(e) {
    this.setData({ extraHint: e.detail.value })
  },
  ensureOrderSelected() {
    if (!this.data.selectedOrder) {
      wx.showToast({ title: '请先选择招募订单', icon: 'none' })
      return false
    }
    return true
  },
  async runAssist(action, mode) {
    if (!this.ensureOrderSelected()) return null
    const order = this.data.selectedOrder
    return addonApi.postDouyinAiAssist({
      model: this.data.textModel,
      action,
      product_name: recruitOrders.buildContextProductName(order),
      title_draft: recruitOrders.buildTitleDraftFromOrder(order, mode, this.data.extraHint),
    })
  },
  async onGenerateArticle() {
    this.setData({ articleBusy: true, articleErr: '', articleOut: '' })
    try {
      const r = await this.runAssist('operation_article', 'article')
      if (!r || !r.ok) {
        this.setData({ articleErr: (r && r.message) || '生成失败' })
        return
      }
      this.setData({ articleOut: r.description || '' })
    } catch (e) {
      this.setData({ articleErr: String(e.message || e).slice(0, 80) })
    } finally {
      this.setData({ articleBusy: false })
    }
  },
  async onGenerateTopic() {
    this.setData({ topicBusy: true, topicErr: '', topicOut: '' })
    try {
      const r = await this.runAssist('operation_topic', 'topic')
      if (!r || !r.ok) {
        this.setData({ topicErr: (r && r.message) || '生成失败' })
        return
      }
      this.setData({ topicOut: r.description || '' })
    } catch (e) {
      this.setData({ topicErr: String(e.message || e).slice(0, 80) })
    } finally {
      this.setData({ topicBusy: false })
    }
  },
  async onGenerateBrief() {
    this.setData({ briefBusy: true, briefErr: '', briefOut: '', briefCopy: '', briefInstruction: '' })
    try {
      const r = await this.runAssist('operation_article', 'brief')
      if (!r || !r.ok) {
        this.setData({ briefErr: (r && r.message) || '生成失败' })
        return
      }
      const brief = briefCompose.sanitize(r.description || '')
      const split = briefCompose.splitIceEditBrief(brief)
      this.setData({
        briefOut: brief,
        briefCopy: split.copy,
        briefInstruction: split.instruction,
      })
    } catch (e) {
      this.setData({ briefErr: String(e.message || e).slice(0, 80) })
    } finally {
      this.setData({ briefBusy: false })
    }
  },
  onCopy(e) {
    const field = e.currentTarget.dataset.field
    const text = String(this.data[field] || '').trim()
    if (!text) return
    wx.setClipboardData({ data: text })
  },
})
