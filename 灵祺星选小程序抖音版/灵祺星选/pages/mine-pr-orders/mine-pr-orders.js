const applicationsStore = require('../../utils/applicationsStore.js')
const { prepareMineSubPage, syncPrPageChrome } = require('../../utils/pageIdentityChrome.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const api = require('../../utils/api.js')
const listFilters = require('../../utils/recruitmentListFilters.js')
const shareCopy = require('../../utils/recruitmentShareCopy.js')
const userProfile = require('../../utils/userProfile.js')
const mpShare = require('../../utils/mpShare.js')
const recruitCoverLib = require('../../utils/recruitCoverLibrary.js')
const recruitShareCover = require('../../utils/recruitShareCover.js')
const sharePoster = require('../../utils/recruitmentSharePoster.js')
const mpApplyShortLink = require('../../utils/mpApplyShortLink.js')
const prRecruitQr = require('../../utils/prRecruitQr.js')
const mpOrderRegistryOps = require('../../utils/mpOrderRegistryOps.js')
const { exportApplicantsExcel, formatExportError } = require('../../utils/mpApplicantsExport.js')
const hallFilters = require('../../utils/recruitmentHallFilters.js')
const prOrderFilters = require('../../utils/prOrderListFilters.js')
const prPublishedOrders = require('../../utils/prPublishedOrders.js')
const recruitTarget = require('../../utils/recruitTarget.js')
const publishDraft = require('../../utils/publishDraft.js')
const mpOrderStatus = require('../../utils/mpOrderStatus.js')
const regionFilterPicker = require('../../utils/regionFilterPicker.js')
const identityTheme = require('../../utils/identityTheme.js')
const prWorkflow = require('../../utils/prOrderWorkflowStage.js')
const deliveryReview = require('../../utils/deliveryReviewPlatform.js')
const inactiveOrder = require('../../utils/inactiveMpRecruitmentOrder.js')
const appDisplay = require('../../utils/applicationDisplay.js')
const mpAccountClientSync = require('../../utils/mpAccountClientSync.js')

function hallLabel(item, mp) {
  if (mp?.hall === 'urgent' || mp?.urgent) return '急单大厅'
  if (mp?.hall === 'ice' || mp?.orderKind === 'ice') return '云剪任务'
  if (item.hall === 'urgent') return '急单大厅'
  if (item.hall === 'ice') return '云剪任务'
  return '招募大厅'
}

function orderForShare(mp, row) {
  if (mp && mp.id) return mp
  const id = row && row.mpOrderId
  if (!id) return null
  return {
    id,
    title: row.title || id,
    region: '全国',
    recruitmentInfo: '',
    taskDetail: '',
    merchantRequirements: '',
  }
}

function buildMetaLine(row) {
  if (!row) return '—'
  if (row.isDeleted || row.deletedAt) {
    const parts = [`删除于 ${row.deletedAt || '—'}`]
    if (row.publishedAt) parts.push(`原发布于 ${row.publishedAt}`)
    return parts.join(' · ')
  }
  const region = String(row.region || '—').trim() || '—'
  const category = String(row.category || '—').trim() || '—'
  return [region, category, row.signupLabel || '—', row.deadlineDaysText || '—'].join(' · ')
}

function mapRow(item, mp) {
  if (mp) {
    applicationsStore.touchPublishedOrderSnapshot(item.mpOrderId, {
      title: String(mp.title || mp.customerName || item.title || item.mpOrderId),
      lastStatus: String(mp.status || 'open'),
      hall: mp.hall === 'urgent' || mp.urgent ? 'urgent' : mp.hall === 'ice' || mp.orderKind === 'ice' ? 'ice' : 'normal',
    })
  }
  const enriched = listFilters.enrichMpOrderListItem(mp, item)
  const pendingVideoCount = prOrderFilters.countPendingVideos(mp)
  const videoCount = prOrderFilters.countVideos(mp)
  const target = recruitTarget.recruitTargetFromMp(mp)
  const platform = String((mp && mp.platform) || (mp && mp.recruitmentPlatform) || '抖音')
  const isScriptOrder = deliveryReview.isScriptReviewPlatform(platform)
  const row = {
    ...enriched,
    mp: mp || null,
    hallLabel: enriched.hallLabel || hallLabel(item, mp),
    platform,
    region: String((mp && mp.region) || (mp && mp.storeName) || ''),
    category: String((mp && mp.category) || '本地生活'),
    recruitTarget: target,
    recruitTargetLabel: recruitTarget.recruitTargetLabel(target),
    pendingVideoCount,
    videoCount,
    pendingScriptCount: prWorkflow.countPendingScripts(mp),
    isScriptOrder,
    reviewPage: isScriptOrder ? 'mine-pr-order-script-review' : 'mine-pr-order-video-review',
    pendingReviewCount: isScriptOrder ? prWorkflow.countPendingScripts(mp) : pendingVideoCount,
    videoReviewLabel:
      videoCount > 0 ? `视频审核(${videoCount})` : '视频审核',
    workflowStage: prWorkflow.resolvePrWorkflowStage(mp),
    canConfirmScheduleQueue: prWorkflow.canConfirmScheduleQueue(mp),
    toggleActionFull: enriched.toggleActionLabel ? `${enriched.toggleActionLabel}招募` : '',
    metaLine: '',
  }
  row.metaLine = buildMetaLine(row)
  return row
}

function rowById(rows, id) {
  const mpOrderId = String(id || '').trim()
  if (!mpOrderId) return null
  return (rows || []).find((r) => r && r.mpOrderId === mpOrderId) || null
}

function buildOrderSharePayload(order) {
  if (!order || !order.id) return null
  const share = {
    title: shareCopy.buildShareTitle(order) || order.title || '灵祺星选招募',
    path: `/pages/detail/detail?id=${encodeURIComponent(order.id)}`,
  }
  const coverUrl = recruitCoverLib.resolveOrderCoverUrl(order)
  return recruitShareCover.attachShareCoverPromise(share, coverUrl)
}

function statusFilterBarLabel(val) {
  const v = String(val || '').trim()
  if (!v || v === '全部') return '状态'
  if (v === mpOrderStatus.HALL_DEFAULT_STATUS_FILTER) return '状态'
  if (v.length > 5) return `${v.slice(0, 4)}…`
  return v
}

Page({
  behaviors: [require('../../behaviors/identityTheme')],
  data: {
    tab: 'published',
    publishedCount: 0,
    pendingScheduleCount: 0,
    pendingVideoReviewCount: 0,
    completedCount: 0,
    stoppedCount: 0,
    deletedCount: 0,
    draftsCount: 0,
    workflowBusyId: '',
    rows: [],
    filteredRows: [],
    draftRows: [],
    filteredDrafts: [],
    keyword: '',
    loading: true,
    err: '',
    deletingId: '',
    togglingId: '',
    exportingId: '',
    filterTarget: 'all',
    filterTargetLabel: '全部身份',
    targetOptions: prOrderFilters.TARGET_FILTERS,
    filterPlatform: '全部',
    platformLabel: '平台',
    platformOptions: deliveryReview.platformFilterOptionsForGroup('video'),
    filterCategory: '全部',
    categoryLabel: '类目',
    categoryOptions: prOrderFilters.CATEGORY_FILTERS,
    filterHall: '全部',
    hallLabel: '大厅',
    hallOptions: prOrderFilters.HALL_TYPE_FILTERS,
    filterProvince: '全部',
    filterCity: '全部',
    regionFilterLabel: '城市',
    regionMultiRange: [['全部'], ['全部']],
    regionMultiValue: [0, 0],
    filterStatus: mpOrderStatus.HALL_DEFAULT_STATUS_FILTER,
    statusLabel: '状态',
    statusOptions: prOrderFilters.STATUS_FILTERS,
    filterCountText: '',
    showShareSheet: false,
    shareOrder: null,
    shareTitle: '',
    shareTab: 'copy',
    sharePosterPath: '',
    sharePosterLoading: false,
    sharePosterErr: '',
    sharePosterStyleIndex: 0,
    sharePosterStyleLabel: '',
    sharePosterAccentColor: '#7c3aed',
    shareApplyLink: '',
    mineGuestMode: false,
    platformGroup: 'video',
    platformGroupOptions: deliveryReview.PR_PLATFORM_GROUP_OPTIONS,
    reviewTabLabel: '待视频审核',
  },
  onLoad(options) {
    syncPrPageChrome(this, { animate: false })
    this.setData(regionFilterPicker.initRegionFilterState('全部', '全部'))
    const tab = String((options && options.tab) || '').trim()
    const platformGroup = String((options && options.platformGroup) || '').trim() === 'script' ? 'script' : 'video'
    const patch = {
      platformGroup,
      reviewTabLabel: platformGroup === 'script' ? '待文稿审核' : '待视频审核',
      platformOptions: deliveryReview.platformFilterOptionsForGroup(platformGroup),
      filterPlatform: '全部',
      platformLabel: '平台',
    }
    if (tab) patch.tab = tab
    this.setData(patch)
  },
  async onShow() {
    const ready = await prepareMineSubPage(this)
    syncPrPageChrome(this, { animate: false })
    if (!ready) {
      this.setData({ filteredRows: [], filteredDrafts: [], loading: false })
      return
    }
    mpShare.enableShareMenu()
    this.load()
  },
  platformScopedRows(rows) {
    const group = this.data.platformGroup || 'video'
    return (rows || []).filter((row) => deliveryReview.matchPrPlatformGroup(row.platform, group))
  },
  onPlatformGroupTap(e) {
    const group = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.group) || 'video')
    if (group === this.data.platformGroup) return
    const platformOptions = deliveryReview.platformFilterOptionsForGroup(group)
    const filterPlatform = deliveryReview.normalizePlatformFilterForGroup(this.data.filterPlatform, group)
    this.setData({
      platformGroup: group,
      reviewTabLabel: group === 'script' ? '待文稿审核' : '待视频审核',
      platformOptions,
      filterPlatform,
      platformLabel: filterPlatform === '全部' ? '平台' : filterPlatform,
    })
    this.refreshFiltered(this.data.rows)
  },
  filterOpts() {
    return {
      tab: this.data.tab,
      filterTarget: this.data.filterTarget,
      filterPlatform: this.data.filterPlatform,
      filterCategory: this.data.filterCategory,
      filterHall: this.data.filterHall,
      filterProvince: this.data.filterProvince,
      filterCity: this.data.filterCity,
      filterStatus: this.data.filterStatus,
      keyword: this.data.keyword,
    }
  },
  filterDraftRows(drafts) {
    const kw = String(this.data.keyword || '').trim()
    if (!kw) return drafts || []
    return (drafts || []).filter((draft) => {
      const title = publishDraft.draftDisplayTitle(draft)
      return title.includes(kw) || String(draft.id || '').includes(kw)
    })
  },
  applyFilters(rows) {
    const tab = this.data.tab || 'published'
    const scoped = (rows || []).filter((row) => {
      if (row.deletedAt || row.isDeleted) return tab === 'deleted'
      if (row.status === 'closed' || row.statusLabel === '已停止') return tab === 'stopped'
      if (tab === 'drafts') return false
      if (tab === 'published' && inactiveOrder.shouldHidePrPublishedRow(row)) return false
      return prWorkflow.matchPrOrdersTab(tab, row.mp)
    })
    const filtered = prOrderFilters.filterPrOrderRows(scoped, this.filterOpts())
    const total = scoped.length
    const filterCountText =
      tab === 'published' && filtered.length !== total ? `显示 ${filtered.length} / ${total} 条` : ''
    return { filtered, filterCountText, scopedTotal: total }
  },
  onTabTap(e) {
    const tab = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'published')
    this.setData({ tab })
    this.refreshFiltered(this.data.rows)
  },
  setTabCounts(rows) {
    const list = rows || []
    let publishedCount = 0
    let pendingScheduleCount = 0
    let pendingVideoReviewCount = 0
    let completedCount = 0
    let stoppedCount = 0
    let deletedCount = 0
    for (const row of list) {
      if (!row) continue
      if (row.deletedAt || row.isDeleted) {
        deletedCount += 1
        continue
      }
      if (row.status === 'closed' || row.statusLabel === '已停止') {
        stoppedCount += 1
        continue
      }
      const stage = row.workflowStage || prWorkflow.resolvePrWorkflowStage(row.mp)
      if (stage === 'pending_schedule') pendingScheduleCount += 1
      else if (stage === 'pending_video_review' || stage === 'pending_script_review') pendingVideoReviewCount += 1
      else if (stage === 'completed') completedCount += 1
      else if (!inactiveOrder.shouldHidePrPublishedRow(row)) publishedCount += 1
    }
    this.setData({
      publishedCount,
      pendingScheduleCount,
      pendingVideoReviewCount,
      completedCount,
      stoppedCount,
      deletedCount,
    })
  },
  refreshFiltered(rows) {
    const source = this.platformScopedRows(rows || this.data.rows)
    this.setTabCounts(source)
    const draftRows = publishDraft.listPublishDrafts().map((draft) => ({
      id: draft.id,
      title: publishDraft.draftDisplayTitle(draft),
      recruitModeLabel: String(draft.recruitModeLabel || '招募'),
      deliveryLabel: publishDraft.deliveryWindowLabel(draft.form && draft.form.deliveryWindow),
      savedAtText: publishDraft.formatDraftSavedAt(draft.savedAt),
      draft,
    }))
    const filteredDrafts = this.filterDraftRows(draftRows)
    const { filtered, filterCountText } = this.applyFilters(source)
    this.setData({
      draftRows,
      filteredDrafts,
      draftsCount: draftRows.length,
      filteredRows: filtered,
      filterCountText,
    })
  },
  onKeywordInput(e) {
    const keyword = String((e.detail && e.detail.value) || '')
    this.setData({ keyword })
    this.refreshFiltered(this.data.rows)
  },
  onTargetChipTap(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || 'all')
    const opt = (this.data.targetOptions || []).find((t) => t.id === id) || { id: 'all', label: '全部' }
    this.setData({
      filterTarget: opt.id,
      filterTargetLabel: opt.label,
    })
    this.refreshFiltered(this.data.rows)
  },
  onPlatformChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.platformOptions[idx] || '全部'
    this.setData({
      filterPlatform: val,
      platformLabel: val === '全部' ? '平台' : val,
    })
    this.refreshFiltered(this.data.rows)
  },
  onCategoryChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.categoryOptions[idx] || '全部'
    this.setData({
      filterCategory: val,
      categoryLabel: val === '全部' ? '类目' : val,
    })
    this.refreshFiltered(this.data.rows)
  },
  onHallChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.hallOptions[idx] || '全部'
    this.setData({
      filterHall: val,
      hallLabel: val === '全部' ? '大厅' : val,
    })
    this.refreshFiltered(this.data.rows)
  },
  onRegionFilterColumnChange(e) {
    const detail = e.detail || {}
    const next = regionFilterPicker.onRegionFilterColumnChange(
      {
        filterProvince: this.data.filterProvince,
        filterCity: this.data.filterCity,
        regionMultiRange: this.data.regionMultiRange,
        regionMultiValue: this.data.regionMultiValue,
      },
      detail.column,
      detail.value,
    )
    this.setData(next)
  },
  onRegionFilterChange(e) {
    const values = (e.detail && e.detail.value) || [0, 0]
    const next = regionFilterPicker.onRegionFilterChange(
      {
        filterProvince: this.data.filterProvince,
        filterCity: this.data.filterCity,
        regionMultiRange: this.data.regionMultiRange,
        regionMultiValue: this.data.regionMultiValue,
      },
      values,
    )
    this.setData(next)
    this.refreshFiltered(this.data.rows)
  },
  onStatusChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.statusOptions[idx] || mpOrderStatus.HALL_DEFAULT_STATUS_FILTER
    this.setData({
      filterStatus: val,
      statusLabel: statusFilterBarLabel(val),
    })
    this.refreshFiltered(this.data.rows)
  },
  onContinueDraft(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    try {
      wx.setStorageSync('meoo_publish_edit_draft_id', id)
    } catch (_) {}
    wx.switchTab({ url: '/pages/publish/publish' })
  },
  onDeleteDraft(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除草稿',
      content: '确定删除该草稿？',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return
        publishDraft.deletePublishDraft(id)
        wx.showToast({ title: '已删除', icon: 'success' })
        this.refreshFiltered(this.data.rows)
      },
    })
  },
  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },
  async load() {
    if (!api.hasApi()) {
      const local = applicationsStore.readPublishedOrders()
      if (!local.length) {
        this.setData({
          rows: [],
          loading: false,
          err: '',
          filterCountText: '',
        })
        this.refreshFiltered([])
        return
      }
      const rows = local.map((item) => mapRow(item, null))
      this.setData({
        rows,
        loading: false,
        err: '未配置后台，无法同步报名人数',
      })
      this.refreshFiltered(rows)
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      await mpAccountClientSync.ensureClientStatePulled().catch(() => null)
      const reg = await ops.fetchRegistry({ includePrOwned: true })
      const mpList = reg.mpRecruitmentOrders || []
      prPublishedOrders.pruneOrphanPublishedOrders(mpList)
      const local = prPublishedOrders.listPublishedOrdersForCurrentPr(mpList)
      if (!local.length) {
        this.setData({
          rows: [],
          loading: false,
          err: '',
          filterCountText: '',
        })
        this.refreshFiltered([])
        return
      }
      const rows = local.map((item) => {
        const mp = mpList.find((o) => o && o.id === item.mpOrderId)
        return mapRow(item, mp)
      })
      this.setData({
        rows,
        loading: false,
        err: '',
      })
      this.refreshFiltered(rows)
    } catch (e) {
      const fallbackLocal = applicationsStore.readPublishedOrders()
      const rows = fallbackLocal.map((item) => mapRow(item, null))
      this.setData({
        rows,
        loading: false,
        err: String(e && e.message ? e.message : e).slice(0, 60),
      })
      this.refreshFiltered(rows)
    }
  },
  goSchedule(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    identityTheme.applyChrome('pr', { animate: false })
    wx.navigateTo({
      url: `/pages/mine-pr-order-schedule/mine-pr-order-schedule?id=${encodeURIComponent(id)}`,
    })
  },
  goScheduleReview(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    identityTheme.applyChrome('pr', { animate: false })
    wx.navigateTo({
      url: `/pages/mine-pr-order-schedule/mine-pr-order-schedule?id=${encodeURIComponent(id)}&view=review`,
    })
  },
  goViewCompleted(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    identityTheme.applyChrome('pr', { animate: false })
    wx.navigateTo({
      url: `/pages/mine-pr-order-video-review/mine-pr-order-video-review?id=${encodeURIComponent(id)}&from=completed`,
    })
  },
  async onConfirmScheduleQueue(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const row = rowById(this.data.rows, id)
    if (!row || !row.mp || this.data.workflowBusyId) return
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '确认去排期',
        content: '确认将该商单移入「待排期」？仅通知达人不会自动进入待排期。',
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!ok) return
    this.setData({ workflowBusyId: id })
    try {
      await mpOrderRegistryOps.patchPrWorkflow(row.mp, prWorkflow.buildConfirmScheduleQueuePatch())
      await this.load()
      wx.showToast({ title: '已移入待排期', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: String(err.message || '操作失败').slice(0, 24), icon: 'none' })
    } finally {
      this.setData({ workflowBusyId: '' })
    }
  },
  async onSkipSchedule(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const row = rowById(this.data.rows, id)
    if (!row || !row.mp || this.data.workflowBusyId) return
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '不排期',
        content: '确认跳过探店排期？订单将直接进入「待视频审核」。',
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!ok) return
    this.setData({ workflowBusyId: id })
    try {
      await mpOrderRegistryOps.patchPrWorkflow(row.mp, prWorkflow.buildSkipSchedulePatch(row.mp))
      await this.load()
      wx.showToast({ title: '已移入待视频审核', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: String(err.message || '操作失败').slice(0, 24), icon: 'none' })
    } finally {
      this.setData({ workflowBusyId: '' })
    }
  },
  async onSkipVideoReview(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const row = rowById(this.data.rows, id)
    if (!row || !row.mp || this.data.workflowBusyId) return
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '不审核',
        content: '确认跳过视频审核？订单将标记为已完成。',
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!ok) return
    this.setData({ workflowBusyId: id })
    try {
      await mpOrderRegistryOps.patchPrWorkflow(row.mp, prWorkflow.buildSkipVideoReviewPatch(), 'done')
      await this.load()
      wx.showToast({ title: '已标记完成', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: String(err.message || '操作失败').slice(0, 24), icon: 'none' })
    } finally {
      this.setData({ workflowBusyId: '' })
    }
  },
  goApplicants(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    identityTheme.applyChrome('pr', { animate: false })
    wx.navigateTo({
      url: `/pages/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(id)}`,
    })
  },
  goVideoReview(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const row = rowById(this.data.filteredRows, id) || rowById(this.data.rows, id)
    const page = row && row.reviewPage ? row.reviewPage : 'mine-pr-order-video-review'
    identityTheme.applyChrome('pr', { animate: false })
    wx.navigateTo({
      url: `/pages/${page}/${page}?id=${encodeURIComponent(id)}`,
    })
  },
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    try {
      wx.setStorageSync('meoo_publish_edit_mp_id', id)
    } catch (_) {}
    wx.switchTab({ url: '/pages/publish/publish' })
  },
  onShare(e) {
    const id = e.currentTarget.dataset.id
    const row = rowById(this.data.filteredRows, id) || rowById(this.data.rows, id)
    if (!row) return
    const order = prRecruitQr.orderForShareWithLiveProfile(orderForShare(row.mp, row))
    if (!order) {
      wx.showToast({ title: '订单数据缺失', icon: 'none' })
      return
    }
    this.setData({
      shareOrder: order,
      shareTitle: shareCopy.buildShareTitle(order),
      showShareSheet: true,
      shareTab: 'copy',
      sharePosterPath: '',
      sharePosterLoading: false,
      sharePosterErr: '',
      sharePosterStyleIndex: 0,
      sharePosterStyleLabel: '',
      sharePosterAccentColor: '#7c3aed',
      shareApplyLink: shareCopy.buildRecruitmentApplyLink(order.id),
    })
    recruitShareCover.preloadShareImageUrl(recruitCoverLib.resolveOrderCoverUrl(order)).catch(() => {})
    mpApplyShortLink
      .fetchApplyShortLink(order.id, order.title)
      .then((out) => {
        if (this.data.shareOrder && this.data.shareOrder.id === order.id) {
          this.setData({ shareApplyLink: out.link || shareCopy.buildRecruitmentApplyLink(order.id) })
        }
      })
      .catch(() => {})
  },
  onShareTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.shareTab) return
    this.setData({ shareTab: tab })
    if (tab === 'poster') this.ensureSharePoster()
  },
  ensureSharePoster() {
    const order = this.data.shareOrder
    if (!order || this.data.sharePosterPath || this.data.sharePosterLoading) return
    const styleIndex = this.data.sharePosterStyleIndex || 0
    const design = sharePoster.resolvePosterDesign(order, styleIndex)
    this.setData({
      sharePosterLoading: true,
      sharePosterErr: '',
      sharePosterPath: '',
      sharePosterStyleLabel: design.styleLabel || '',
      sharePosterAccentColor: sharePoster.resolvePosterThemeColor(design),
    })
    sharePoster
      .buildRecruitmentSharePosterPath(order, styleIndex)
      .then((path) => {
        this.setData({ sharePosterPath: path, sharePosterLoading: false })
      })
      .catch((err) => {
        const raw = String((err && err.message) || err || '海报生成失败')
        const msg =
          raw === 'wxacode_unavailable' ? '小程序码生成失败，请稍后重试' : raw.slice(0, 40)
        this.setData({
          sharePosterLoading: false,
          sharePosterErr: msg,
        })
      })
  },
  onSwitchPosterStyle() {
    const order = this.data.shareOrder
    if (!order || this.data.sharePosterLoading) return
    const nextIndex = sharePoster.normalizePosterStyleIndex((this.data.sharePosterStyleIndex || 0) + 1)
    const design = sharePoster.resolvePosterDesign(order, nextIndex)
    this.setData({
      sharePosterStyleIndex: nextIndex,
      sharePosterStyleLabel: design.styleLabel || '',
      sharePosterAccentColor: sharePoster.resolvePosterThemeColor(design),
      sharePosterPath: '',
      sharePosterLoading: true,
      sharePosterErr: '',
    })
    sharePoster
      .buildRecruitmentSharePosterPath(order, nextIndex)
      .then((path) => {
        this.setData({ sharePosterPath: path, sharePosterLoading: false })
      })
      .catch((err) => {
        const raw = String((err && err.message) || err || '海报生成失败')
        const msg =
          raw === 'wxacode_unavailable' ? '小程序码生成失败，请稍后重试' : raw.slice(0, 40)
        this.setData({
          sharePosterLoading: false,
          sharePosterErr: msg,
        })
      })
  },
  onSaveSharePoster() {
    const path = this.data.sharePosterPath
    if (!path) return
    wx.showLoading({ title: '保存中', mask: true })
    sharePoster
      .savePosterToAlbum(path)
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      })
      .catch((err) => {
        wx.hideLoading()
        const msg = String((err && err.errMsg) || err || '')
        if (/auth deny|authorize/i.test(msg)) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册后重试。',
            showCancel: false,
          })
          return
        }
        wx.showToast({ title: '保存失败', icon: 'none' })
      })
  },
  onShareCopyLink() {
    const link =
      this.data.shareApplyLink ||
      (this.data.shareOrder && shareCopy.buildRecruitmentApplyLink(this.data.shareOrder.id)) ||
      ''
    if (!link) {
      wx.showToast({ title: '链接生成中', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: link,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' }),
    })
  },
  noopShareSheetTap() {},
  onCloseShareSheet() {
    this.setData({
      showShareSheet: false,
      sharePosterPath: '',
      sharePosterLoading: false,
      sharePosterErr: '',
      sharePosterStyleIndex: 0,
      sharePosterStyleLabel: '',
      sharePosterAccentColor: '#7c3aed',
    })
  },
  onShareCopyText() {
    const order = this.data.shareOrder
    if (!order) return
    wx.showLoading({ title: '生成报名链接', mask: true })
    shareCopy
      .buildGroupCopyTextAsync(order, userProfile.readPrProfile())
      .then((text) => {
        wx.hideLoading()
        this.setData({ showShareSheet: false })
        wx.setClipboardData({
          data: text,
          success: () => {
            wx.showModal({
              title: '已复制招募信息',
              content: '请打开微信群，粘贴发送给达人即可。',
              showCancel: false,
            })
          },
        })
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '生成链接失败', icon: 'none' })
      })
  },
  onShareTimelineTap() {
    const order = this.data.shareOrder
    if (!order) return
    wx.showLoading({ title: '生成招募文案', mask: true })
    shareCopy
      .buildGroupCopyTextAsync(order, userProfile.readPrProfile())
      .then((text) => {
        wx.hideLoading()
        this.setData({ showShareSheet: false })
        wx.setClipboardData({
          data: text,
          success: () => {
            wx.showModal({
              title: '已复制招募文案',
              content:
                '请点击右上角 ···，选择「分享到朋友圈」。小程序卡片会带上本招募单，文案可粘贴到朋友圈正文。',
              showCancel: false,
            })
          },
        })
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '生成文案失败', icon: 'none' })
      })
  },
  onShareAppMessage() {
    const payload = buildOrderSharePayload(this.data.shareOrder)
    if (!payload) return mpShare.defaultShare('/pages/index/index')
    return payload
  },
  onShareTimeline() {
    const order = this.data.shareOrder
    if (!order || !order.id) {
      return mpShare.defaultTimelineShare()
    }
    const payload = buildOrderSharePayload(order)
    const out = {
      title: payload.title,
      query: `id=${encodeURIComponent(order.id)}`,
    }
    if (payload.promise) {
      return {
        ...out,
        promise: payload.promise.then((p) => ({
          ...out,
          imageUrl: p.imageUrl,
        })),
      }
    }
    if (payload.imageUrl) out.imageUrl = payload.imageUrl
    return out
  },
  onToggleStatus(e) {
    const id = e.currentTarget.dataset.id
    const row = rowById(this.data.filteredRows, id) || rowById(this.data.rows, id)
    if (!id || !row || this.data.togglingId) return
    if (!row.canToggleRecruit) {
      wx.showToast({ title: '当前状态不可切换', icon: 'none' })
      return
    }
    if (!api.hasApi()) {
      wx.showToast({ title: '未配置后台地址', icon: 'none' })
      return
    }
    const next = row.toggleNextStatus
    const action = row.toggleActionLabel
    if (next === 'open') {
      const deadlineMs = Number(row.deadlineMs) || 0
      const expired =
        (deadlineMs > 0 && Date.now() >= deadlineMs) ||
        row.status === 'expired' ||
        row.statusLabel === '已截止'
      if (expired) {
        wx.showModal({
          title: '无法开始招募',
          content: '报名截止日期已过，请先修改报名截止日期后再开始招募。',
          confirmText: '去编辑',
          success: (res) => {
            if (!res.confirm) return
            try {
              wx.setStorageSync('meoo_publish_edit_mp_id', id)
            } catch (_) {}
            wx.switchTab({ url: '/pages/publish/publish' })
          },
        })
        return
      }
    }
    wx.showModal({
      title: `${action}招募`,
      content:
        next === 'closed'
          ? '停止后达人将无法在招募大厅继续报名，已报名数据保留。'
          : '开始后将在招募大厅重新展示并开放报名。',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ togglingId: id })
        wx.showLoading({ title: `${action}中…`, mask: true })
        try {
          await mpOrderRegistryOps.patchMpRecruitmentOrderStatus(id, next)
          wx.showToast({ title: `已${action}`, icon: 'success' })
          this.setData({ tab: next === 'closed' ? 'stopped' : 'published' })
          const localItem =
            applicationsStore.readPublishedOrders().find((x) => x.mpOrderId === id) || {
              mpOrderId: id,
              title: row.title,
            }
          const optimisticMp = row.mp ? { ...row.mp, status: next } : { id, status: next }
          const patchRow = (rows) =>
            (rows || []).map((r) => {
              if (!r || r.mpOrderId !== id) return r
              return mapRow(localItem, optimisticMp)
            })
          const nextRows = patchRow(this.data.rows)
          const { filtered, filterCountText } = this.applyFilters(nextRows)
          this.setData({ rows: nextRows, filteredRows: filtered, filterCountText })
          await this.load()
        } catch (err) {
          wx.showToast({
            title: String(err && err.message ? err.message : err).slice(0, 28),
            icon: 'none',
          })
        } finally {
          wx.hideLoading()
          this.setData({ togglingId: '' })
        }
      },
    })
  },
  async onDownload(e) {
    const id = e.currentTarget.dataset.id
    const row = rowById(this.data.filteredRows, id) || rowById(this.data.rows, id)
    if (!row || this.data.exportingId) return
    const mpOrderId = row.mpOrderId
    this.setData({ exportingId: mpOrderId })
    wx.showLoading({ title: '生成 Excel…', mask: true })
    try {
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [mpOrderId] })
      const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === mpOrderId)
      const raw = mp && Array.isArray(mp.applicants) ? mp.applicants : []
      if (!raw.length) {
        wx.showToast({ title: '暂无报名可下载', icon: 'none' })
        return
      }
      const applicants = raw.map((a, i) => appDisplay.enrichApplicantRow(a, i, reg, mp))
      const res = await exportApplicantsExcel(applicants, mpOrderId)
      if (res.mode === 'disk') {
        wx.showToast({ title: 'Excel 已保存到手机', icon: 'success', duration: 2500 })
      } else if (res.mode === 'clipboard') {
        wx.showToast({ title: '已复制，可粘贴到 Excel', icon: 'none', duration: 2500 })
      }
    } catch (err) {
      wx.showToast({
        title: formatExportError(err).slice(0, 36),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ exportingId: '' })
    }
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.deletingId) return
    wx.showModal({
      title: '删除发单',
      content: '删除后达人将无法在招募大厅看到该单，已报名信息将一并移除。确定删除？',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        if (!api.hasApi()) {
          applicationsStore.markPublishedOrderDeleted(id)
          wx.showToast({ title: '已移入已删除', icon: 'none' })
          this.load()
          return
        }
        this.setData({ deletingId: id })
        wx.showLoading({ title: '删除中…', mask: true })
        try {
          await mpOrderRegistryOps.deleteMpRecruitmentOrder(id)
          applicationsStore.markPublishedOrderDeleted(id)
          mpAccountClientSync.schedulePush(0)
          wx.showToast({ title: '已删除', icon: 'success' })
          this.setData({ tab: 'deleted' })
          await this.load()
        } catch (err) {
          wx.showToast({
            title: String(err && err.message ? err.message : err).slice(0, 28),
            icon: 'none',
          })
        } finally {
          wx.hideLoading()
          this.setData({ deletingId: '' })
        }
      },
    })
  },
})
