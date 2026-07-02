const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const addonApi = require('../../../utils/mpAddonMerchantApi.js')
const recruitOrders = require('../../../utils/mpAddonRecruitOrders.js')
const viralBriefAi = require('../../../utils/mpViralBriefAi.js')

const STYLE_OPTIONS = viralBriefAi.STYLE_OPTIONS
const PLATFORM_OPTIONS = viralBriefAi.PLATFORM_OPTIONS

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    textModel: 'qwen',
    textModels: addonApi.TEXT_MODELS,
    styleOptions: STYLE_OPTIONS,
    platformOptions: PLATFORM_OPTIONS,
    briefStyle: 'review',
    briefPlatform: 'douyin',
    platformTouched: false,
    orderKeyword: '',
    orderRows: [],
    filteredOrders: [],
    selectedOrderId: '',
    selectedOrder: null,
    showOrderPicker: false,
    extraHint: '',
    briefResult: null,
    briefBusy: false,
    briefErr: '',
    progressMsg: '',
  },
  onShow() {
    if (!mpAddonPageGate.ensureAddonPageAccess('brief')) return
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
    const patch = { filteredOrders: filtered, selectedOrder }
    if (selectedOrder && !this.data.platformTouched) {
      patch.briefPlatform = viralBriefAi.resolvePlatform(selectedOrder)
    }
    this.setData(patch)
  },
  onModel(e) {
    this.setData({ textModel: e.currentTarget.dataset.id })
  },
  onStyle(e) {
    this.setData({ briefStyle: e.currentTarget.dataset.id })
  },
  onPlatform(e) {
    this.setData({ briefPlatform: e.currentTarget.dataset.id, platformTouched: true })
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
    const patch = {
      selectedOrderId: id,
      selectedOrder,
      showOrderPicker: false,
      orderKeyword: '',
      briefResult: null,
      platformTouched: false,
    }
    if (selectedOrder) patch.briefPlatform = viralBriefAi.resolvePlatform(selectedOrder)
    this.setData(patch)
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
  async onGenerateBrief() {
    if (!this.ensureOrderSelected()) return
    this.setData({
      briefBusy: true,
      briefErr: '',
      briefResult: null,
      progressMsg: '准备生成…',
    })
    try {
      const result = await viralBriefAi.generateViralBrief({
        order: this.data.selectedOrder,
        platform: this.data.briefPlatform,
        style: this.data.briefStyle,
        extraHint: this.data.extraHint,
        model: this.data.textModel,
        onProgress: (msg) => this.setData({ progressMsg: msg }),
      })
      this.setData({ briefResult: result, progressMsg: '生成完成' })
    } catch (e) {
      this.setData({
        briefErr: String(e.message || e).slice(0, 120),
        progressMsg: '',
      })
    } finally {
      this.setData({ briefBusy: false })
    }
  },
  onCopy(e) {
    const field = e.currentTarget.dataset.field
    let text = ''
    if (field === 'full') {
      text = String((this.data.briefResult && this.data.briefResult.fullMarkdown) || '').trim()
    } else {
      text = String(this.data[field] || '').trim()
    }
    if (!text) return
    wx.setClipboardData({ data: text })
  },
})
