const applicationsStore = require('../../utils/applicationsStore.js')
const { prepareMineSubPage } = require('../../utils/pageIdentityChrome.js')
const appRegistrySync = require('../../utils/applicationsRegistrySync.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const api = require('../../utils/api.js')
const appDisplay = require('../../utils/applicationDisplay.js')
const appFilters = require('../../utils/applicationFilters.js')
const talentAppStatus = require('../../utils/talentApplicationStatus.js')
const videoUpload = require('../../utils/recruitmentVideoUpload.js')
const mpSubscribeMessages = require('../../utils/mpSubscribeMessages.js')
const hallFilters = require('../../utils/recruitmentHallFilters.js')

Page({
  data: {
    rows: [],
    filteredRows: [],
    loading: true,
    filterTab: 'registered',
    tabOptions: talentAppStatus.TALENT_APPLICATION_TABS,
    timeFilter: 'all',
    timeFilterLabel: '时间',
    category: '全部',
    categoryLabel: '类目',
    province: '全部',
    city: '全部',
    regionLabel: '城市',
    timeOptions: appFilters.APPLICATION_TIME_FILTERS,
    categoryOptions: appFilters.CATEGORY_FILTERS,
    cityOptions: ['全部'],
    progressFilter: 'all',
    progressFilterLabel: '状态',
    progressOptions: appFilters.TALENT_APP_PROGRESS_FILTERS,
    orderTypeFilter: 'all',
    orderTypeFilterLabel: '类型',
    orderTypeOptions: appFilters.TALENT_ORDER_TYPE_FILTERS,
    keyword: '',
    uploadingKey: '',
    mineGuestMode: false,
  },
  async onShow() {
    const ready = await prepareMineSubPage(this)
    if (!ready) {
      this.setData({ rows: [], filteredRows: [], loading: false })
      return
    }
    this.load()
  },
  applyFilters(rows, tabOverride) {
    const tab = tabOverride || this.data.filterTab || 'registered'
    const byTab = (rows || []).filter((r) =>
      talentAppStatus.matchTalentApplicationTab(
        tab,
        r.progressMp || null,
        r.progressMe || null,
        r.mpOrderId,
        { selectionNotified: r.selectionNotified, isIce: r.isIce },
      ),
    )
    return appFilters.filterApplicationRows(byTab, {
      timeFilter: this.data.timeFilter,
      category: this.data.category,
      province: this.data.province,
      city: this.data.city,
      keyword: this.data.keyword,
      progressFilter: this.data.progressFilter,
      orderTypeFilter: this.data.orderTypeFilter,
    })
  },
  enrichLocalFallbackRow(a) {
    const mpOrderId = String((a && a.mpOrderId) || '')
    const isIce = /^MP-ICE-/i.test(mpOrderId)
    const displayStatus = talentAppStatus.resolveApplicationDisplayStatus(null, null, mpOrderId, { isIce })
    const progress = talentAppStatus.resolveTalentApplicationProgress(null, null, mpOrderId)
    return {
      ...a,
      title: a.title || mpOrderId,
      statusLabel: '—',
      platformIcon: hallFilters.platformIcon(a.platform || '抖音'),
      category: '其他',
      canUploadVideo: false,
      isIce,
      progressId: progress.id,
      progressLabel: progress.label,
      progressMp: null,
      progressMe: null,
      selectionNotified: false,
      displayTabId: displayStatus.tabId,
      displayStatusLabel: displayStatus.label,
      displayStatusTone: displayStatus.tone,
      showConfirmBtn: displayStatus.showConfirmBtn,
      iceActionLabel: isIce ? '查看云剪任务' : '',
      hallLabel: isIce ? '云剪任务' : '招募大厅',
    }
  },
  onTabChange(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim()
    if (!id || id === this.data.filterTab) return
    this.setData({
      filterTab: id,
      progressFilter: 'all',
      progressFilterLabel: '状态',
      filteredRows: this.applyFilters(this.data.rows, id),
    })
  },
  async load() {
    const local = applicationsStore.readApplications()
    if (!api.hasApi()) {
      const rows = local.map((a) => this.enrichLocalFallbackRow(a))
      const cityOptions = hallFilters.buildCityFilterOptions(rows)
      this.setData({
        rows,
        filteredRows: this.applyFilters(rows),
        cityOptions,
        loading: false,
      })
      return
    }
    this.setData({ loading: true })
    try {
      const reg = await appRegistrySync.fetchRegistryAndReconcileApplications({ includeLocalContext: true })
      const local = applicationsStore.readApplications()
      const mpList = reg.mpRecruitmentOrders || []
      const enriched = local.map((a) => {
        const mp = mpList.find((o) => o && o.id === a.mpOrderId)
        const row = appDisplay.enrichTalentApplicationRow(a, mp, reg)
        if (row.applicantId && row.applicantId !== a.applicantId) {
          applicationsStore.updateApplicationApplicantId(a.mpOrderId, row.applicantId)
        }
        return row
      })
      const cityOptions = hallFilters.buildCityFilterOptions(enriched)
      this.setData({
        rows: enriched,
        filteredRows: this.applyFilters(enriched),
        cityOptions,
        loading: false,
      })
    } catch {
      const rows = local.map((a) => this.enrichLocalFallbackRow(a))
      this.setData({
        rows,
        filteredRows: this.applyFilters(rows),
        loading: false,
      })
    }
  },
  onProgressFilterChange(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.progressOptions[idx] || this.data.progressOptions[0]
    const progressFilter = opt && opt.id ? opt.id : 'all'
    const progressFilterLabel =
      progressFilter === 'all' ? '状态' : opt && opt.label ? opt.label : '状态'
    this.setData({
      progressFilter,
      progressFilterLabel,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onOrderTypeFilterChange(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.orderTypeOptions[idx] || this.data.orderTypeOptions[0]
    this.setData({
      orderTypeFilter: opt.id,
      orderTypeFilterLabel: opt.id === 'all' ? '类型' : opt.label,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onTimeFilterChange(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.timeOptions[idx] || this.data.timeOptions[0]
    this.setData({
      timeFilter: opt.id,
      timeFilterLabel: opt.id === 'all' ? '时间' : opt.label,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onCategoryChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.categoryOptions[idx] || '全部'
    this.setData({
      category: val,
      categoryLabel: val === '全部' ? '类目' : val,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onCityChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.cityOptions[idx] || '全部'
    this.setData({
      city: val,
      province: '全部',
      regionLabel: val === '全部' ? '城市' : val,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onKeywordInput(e) {
    const keyword = String((e.detail && e.detail.value) || '')
    this.setData({
      keyword,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
  async onUploadVideo(e) {
    const ds = e.currentTarget.dataset || {}
    const id = String(ds.id || ds.mpOrderId || '').trim()
    let applicantId = String(ds.applicantId || ds.applicant || '').trim()
    if (!applicantId && id) {
      const row = (this.data.filteredRows || this.data.rows || []).find((r) => r && r.mpOrderId === id)
      if (row && row.applicantId) applicantId = String(row.applicantId).trim()
    }
    if (!id) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' })
      return
    }
    if (!applicantId && api.hasApi()) {
      wx.showLoading({ title: '准备上传…', mask: true })
      try {
        const reg = await ops.fetchRegistry({ includeLocalContext: true })
        const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === id)
        const talentContactPrGate = require('../../utils/talentContactPrGate.js')
        const found = mp && talentContactPrGate.findMyApplicant(mp, id)
        if (found && found.id) {
          applicantId = String(found.id).trim()
          applicationsStore.updateApplicationApplicantId(id, applicantId)
        }
      } catch (_) {
        /* 继续用本地数据 */
      } finally {
        wx.hideLoading()
      }
    }
    if (!applicantId) {
      wx.showModal({
        title: '无法上传',
        content: '未找到您的报名记录，请返回商单详情确认已报名成功后再试。',
        showCancel: false,
      })
      return
    }
    const key = `${id}-${applicantId}`
    if (this.data.uploadingKey) return
    this.setData({ uploadingKey: key })
    try {
      await mpSubscribeMessages.requestForVideoReview()
    } catch (_) {}
    videoUpload
      .chooseAndUploadVideo(id, applicantId)
      .then(() => this.load())
      .catch(() => {})
      .finally(() => this.setData({ uploadingKey: '' }))
  },
})
