const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const recruitOrders = require('../../../utils/mpAddonRecruitOrders.js')
const viralBriefAi = require('../../../utils/mpViralBriefAi.js')
const userProfile = require('../../../utils/userProfile.js')

const STYLE_OPTIONS = viralBriefAi.STYLE_OPTIONS
const PLATFORM_OPTIONS = viralBriefAi.PLATFORM_OPTIONS
const BRIEF_POINTS_PER_USE = 5

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
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
    copyManuscriptMode: false,
    pointsTip: '',
    isPr: false,
    orderEmptyHint: '暂无匹配订单',
    heroSub: '',
    orderCardSub: '',
    generateSub: '',
  },
  onShow() {
    if (!mpAddonPageGate.ensureAddonPageAccess('brief')) return
    const identity = userProfile.readIdentity()
    const isPr = identity === 'pr'
    this.setData({
      isPr,
      orderEmptyHint: isPr
        ? '暂无匹配订单，请先在「我的发单」发布招募。'
        : '暂无在招商单，请前往招募大厅浏览。',
      heroSub: isPr
        ? '选择招募订单 → 通读需求 → 输出钩子、分镜、话题与审片清单'
        : '选择商单 → 通读需求 → 输出钩子、分镜、话题与审片清单',
      orderCardSub: isPr
        ? '选择本账号已发布的招募订单，按订单实际要求生成爆款 Brief'
        : '选择大厅在招商单，按订单实际要求生成爆款 Brief',
      generateSub: `两阶段：通读订单 → 输出结构化 Brief（${BRIEF_POINTS_PER_USE} 积分/篇，生成成功后扣减）`,
    })
    this.reloadOrders()
  },
  async reloadOrders() {
    try {
      const identity = userProfile.readIdentity()
      const rows = await recruitOrders.loadRecruitOrderPickerRowsForIdentity(identity)
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
    patch.copyManuscriptMode = viralBriefAi.isCopyManuscriptPlatform(
      patch.briefPlatform || this.data.briefPlatform,
    )
    this.setData(patch)
  },
  onStyle(e) {
    this.setData({ briefStyle: e.currentTarget.dataset.id })
  },
  onPlatform(e) {
    const briefPlatform = e.currentTarget.dataset.id
    this.setData({
      briefPlatform,
      platformTouched: true,
      copyManuscriptMode: viralBriefAi.isCopyManuscriptPlatform(briefPlatform),
    })
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
    patch.copyManuscriptMode = viralBriefAi.isCopyManuscriptPlatform(patch.briefPlatform || this.data.briefPlatform)
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
      pointsTip: '',
      progressMsg: '准备生成…',
    })
    try {
      const result = await viralBriefAi.generateViralBrief({
        order: this.data.selectedOrder,
        platform: this.data.briefPlatform,
        style: this.data.briefStyle,
        extraHint: this.data.extraHint,
        onProgress: (msg) => this.setData({ progressMsg: msg }),
      })
      this.setData({
        briefResult: result,
        progressMsg: '生成完成',
        pointsTip: `已扣 ${BRIEF_POINTS_PER_USE} 积分`,
      })
    } catch (e) {
      this.setData({
        briefErr: String(e.message || e).slice(0, 120),
        progressMsg: '',
        pointsTip: '',
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
