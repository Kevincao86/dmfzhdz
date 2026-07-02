const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const recruitOrders = require('../../../utils/mpAddonRecruitOrders.js')
const viralBriefAi = require('../../../utils/mpViralBriefAi.js')
const mpPointsSpend = require('../../../utils/mpPointsSpendApi.js')
const mpBriefGenRecords = require('../../../utils/mpBriefGenRecordsApi.js')
const userProfile = require('../../../utils/userProfile.js')

const STYLE_OPTIONS = viralBriefAi.STYLE_OPTIONS
const PLATFORM_OPTIONS = viralBriefAi.PLATFORM_OPTIONS
const BRIEF_POINTS_PER_USE = mpPointsSpend.BRIEF_POINTS_PER_USE

const ROUTES = {
  recharge: '/pages/subpack-mine/mine-xingxuan-points-recharge/mine-xingxuan-points-recharge',
  membership: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership',
}

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
    briefResultIncomplete: false,
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
    canGenerateBrief: false,
    affordHint: '',
    pointsBalance: 0,
    affordChecking: false,
    affordErrorCode: '',
    mainTab: 'generate',
    briefRecords: [],
    recordsLoading: false,
    recordsErr: '',
    retentionDays: 7,
    expandedRecordId: '',
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
    this.refreshAffordState()
    if (this.data.mainTab === 'records') this.loadBriefRecords()
  },
  onPickMainTab(e) {
    const mainTab = e.currentTarget.dataset.tab === 'records' ? 'records' : 'generate'
    if (mainTab === this.data.mainTab) return
    this.setData({ mainTab })
    if (mainTab === 'records') void this.loadBriefRecords()
  },
  formatRecordTime(iso) {
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return '—'
    const d = new Date(t)
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  },
  platformLabel(id) {
    const hit = PLATFORM_OPTIONS.find((p) => p.id === id)
    return (hit && hit.label) || id || '—'
  },
  styleLabel(id) {
    const hit = STYLE_OPTIONS.find((s) => s.id === id)
    return (hit && hit.label) || id || '—'
  },
  isBriefStructurallyIncomplete(result) {
    if (!result) return false
    if (result.outputMode === 'copy_manuscript') {
      return !(result.fullCopy || (result.bodySections && result.bodySections.length))
    }
    return !(result.hooks && result.hooks.length) && !(result.structure && result.structure.length)
  },
  scrollToBriefResult() {
    wx.nextTick(() => {
      wx.pageScrollTo({ selector: '#brief-result-anchor', duration: 280 }).catch(() => {})
    })
  },
  async loadBriefRecords() {
    this.setData({ recordsLoading: true, recordsErr: '' })
    try {
      const data = await mpBriefGenRecords.fetchBriefGenRecords()
      const briefRecords = (data.records || []).map((row) => ({
        ...row,
        createdAtLabel: this.formatRecordTime(row.createdAt),
        platformLabel: this.platformLabel(row.platform),
        styleLabel: this.styleLabel(row.style),
        preview: String(row.fullMarkdown || '').trim().slice(0, 120),
      }))
      this.setData({
        briefRecords,
        retentionDays: data.retentionDays || 7,
        recordsLoading: false,
      })
    } catch (e) {
      this.setData({
        recordsLoading: false,
        recordsErr: String(e.message || e || '加载失败'),
        briefRecords: [],
      })
    }
  },
  onToggleRecord(e) {
    const id = String(e.currentTarget.dataset.id || '')
    this.setData({ expandedRecordId: this.data.expandedRecordId === id ? '' : id })
  },
  onCopyRecord(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const row = (this.data.briefRecords || []).find((r) => r.id === id)
    const text = String((row && row.fullMarkdown) || '').trim()
    if (!text) return
    wx.setClipboardData({ data: text })
  },
  async refreshAffordState() {
    this.setData({ affordChecking: true })
    try {
      const result = await mpPointsSpend.checkPointsAffordable('brief')
      if (result.ok) {
        this.setData({
          canGenerateBrief: true,
          affordHint: '',
          pointsBalance: result.balance,
        })
      } else {
        this.setData({
          canGenerateBrief: false,
          affordHint: result.message || '积分不足，请先充值或升级会员',
          pointsBalance: Math.max(0, Number(result.balance) || 0),
        })
      }
    } catch (e) {
      this.setData({
        canGenerateBrief: false,
        affordHint: String(e.message || e || '积分校验失败'),
      })
    } finally {
      this.setData({ affordChecking: false })
    }
  },
  showAffordModal(message, errCode) {
    const err = { code: errCode, message }
    const action = mpPointsSpend.affordActionFromError(err)
    const isMembership = action === 'membership'
    wx.showModal({
      title: isMembership ? '请升级会员' : '积分不足',
      content: message || (isMembership ? '当前档位未开通 Brief 生成，请升级会员后使用' : '积分不足，请先充值'),
      confirmText: isMembership ? '去升级' : '去充值',
      cancelText: '知道了',
      success: (res) => {
        if (!res.confirm) return
        wx.navigateTo({ url: isMembership ? ROUTES.membership : ROUTES.recharge })
      },
    })
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
      briefResultIncomplete: false,
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
    if (!this.data.canGenerateBrief) {
      this.showAffordModal(this.data.affordHint, this.data.affordErrorCode)
      return
    }
    const afford = await mpPointsSpend.checkPointsAffordable('brief')
    if (!afford.ok) {
      this.setData({
        canGenerateBrief: false,
        affordHint: afford.message,
        affordErrorCode: afford.error,
      })
      this.showAffordModal(afford.message, afford.error)
      return
    }
    this.setData({
      briefBusy: true,
      briefErr: '',
      briefResult: null,
      briefResultIncomplete: false,
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
        briefResultIncomplete: this.isBriefStructurallyIncomplete(result),
        progressMsg: '生成完成',
        pointsTip: `已扣 ${BRIEF_POINTS_PER_USE} 积分`,
      })
      this.scrollToBriefResult()
      void this.refreshAffordState()
      if (this.data.mainTab === 'records') void this.loadBriefRecords()
    } catch (e) {
      const msg = String(e.message || e).slice(0, 120)
      this.setData({
        briefErr: msg,
        progressMsg: '',
        pointsTip: '',
      })
      if (/积分不足|未开通|升级会员/.test(msg)) {
        this.setData({ canGenerateBrief: false, affordHint: msg })
      }
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
