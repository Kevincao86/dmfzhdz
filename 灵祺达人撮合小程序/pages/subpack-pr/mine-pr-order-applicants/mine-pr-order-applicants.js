const ops = require('../../../utils/opsRegistryTalentMp.js')
const { syncPrPageChrome } = require('../../../utils/pageIdentityChrome.js')
const api = require('../../../utils/api.js')
const userProfile = require('../../../utils/userProfile.js')
const chat = require('../../../utils/talentChat.js')
const appDisplay = require('../../../utils/applicationDisplay.js')
const heroMeta = require('../../../utils/mpOrderHeroMeta.js')
const selection = require('../../../utils/mpApplicantSelection.js')
const talentInboxMatch = require('../../../utils/talentInboxMatch.js')
const { exportApplicantsExcel, formatExportError, showExportResultToast } = require('../../../utils/mpApplicantsExport.js')
const mpGroupQr = require('../../../utils/mpGroupQr.js')
const iceOrderStats = require('../../../utils/iceOrderStats.js')
const videoUpload = require('../../../utils/recruitmentVideoUpload.js')
const mpOrderRegistryOps = require('../../../utils/mpOrderRegistryOps.js')
const mpOrderIce = require('../../../utils/mpOrderIceStatus.js')
const applicantExtras = require('../../../utils/applicantListExtras.js')
const visitScheduleRuntime = require('../../../utils/visitScheduleRuntime.js')
const prDouyinCpsSync = require('../../../utils/prDouyinCpsSync.js')
const prWorkflow = require('../../../utils/prOrderWorkflowStage.js')
const talentPrPricing = require('../../../utils/talentPrPricingApi.js')
const xingxuanEnhance = require('../../../utils/xingxuanEnhanceApi.js')
const mpApiErrors = require('../../../utils/mpApiErrors.js')
const applicantApplyFormDisplay = require('../../../utils/applicantApplyFormDisplay.js')
const applicantPickShare = require('../../../utils/applicantPickShare.js')
const publishLinkUtil = require('../../../utils/recruitmentPublishLink.js')

const EMPTY_LIST_FILTERS = {
  searchQuery: '',
  filterSalesLevel: '',
  filterTag: '',
  filterNotified: '',
}

function findApplicantById(applicants, id) {
  const aid = String(id || '').trim()
  if (!aid) return null
  return (applicants || []).find((a) => a && String(a.id) === aid) || null
}

function formatCreditShort(credit) {
  if (!credit) return ''
  const score = credit.score ?? 0
  const reject = credit.rejectCount ?? 0
  const onTime = credit.onTimeRate ?? 0
  const noShow = credit.noShowCount ?? 0
  let label = `信用${score} · 准时${onTime}% · 驳回${reject}`
  if (noShow > 0) label += ` · 爽约${noShow}`
  return label
}

function formatWatchlistBadge(hit) {
  if (!hit || !hit.list) return ''
  if (hit.list === 'blacklist') return '黑名单'
  return '灰名单'
}

function countPublishLinkStats(applicants) {
  let pending = 0
  let submitted = 0
  for (const a of applicants || []) {
    if (!a || !a.selected) continue
    if (String(a.videoStatus || '') !== 'passed') continue
    const url = String(a.douyinPublishUrl || a.visitPublishUrl || '').trim()
    if (!url) pending += 1
    else if (String(a.aiVerifyStatus || '') !== 'passed') submitted += 1
  }
  return { publishLinkPendingCount: pending, publishLinkSubmittedCount: submitted }
}

Page({
  data: {
    mpOrderId: '',
    loading: true,
    err: '',
    title: '',
    orderNo: '',
    publishedAt: '',
    deadlineText: '',
    status: '',
    statusLabel: '',
    hallLabel: '',
    isIce: false,
    iceVerifyMode: 'ai',
    iceClaimed: 0,
    iceCompleted: 0,
    icePendingReview: 0,
    applicants: [],
    selectedIds: [],
    selectedCount: 0,
    notifiedCount: 0,
    selectedApplicants: [],
    checkedIds: [],
    checkedCount: 0,
    batchConfirming: false,
    showSelectedPanel: false,
    filterSelectedOnly: false,
    displayApplicants: [],
    exportingAll: false,
    groupQrImage: '',
    groupQrExpired: false,
    groupQrUploading: false,
    showGroupQrPreview: false,
    notifying: false,
    savingSelect: false,
    chatEnabled: false,
    chattingId: '',
    mpOrder: null,
    iceReviewBusyId: '',
    iceRejectModal: false,
    iceRejectTargetId: '',
    iceRejectTargetName: '',
    iceRejectReason: '',
    canCompleteIce: false,
    completingIce: false,
    listFilters: EMPTY_LIST_FILTERS,
    tagFilterOptions: [],
    salesLevelOptions: [],
    filterNotifiedOptions: [
      { id: '', label: '通知状态 · 全部' },
      { id: 'yes', label: '已发通知' },
      { id: 'no', label: '未发通知' },
    ],
    filterNotifiedIndex: 0,
    visitSlots: '09:00-12:00,14:00-17:00,17:00-20:00',
    visitDate: '',
    showSchedulePanel: false,
    shareTable: true,
    mealCount: 1,
    tableSize: 4,
    lqThemeClass: 'lq-theme-pr',
    scheduleBusy: false,
    filterSalesLevelIndex: 0,
    filterTagIndex: 0,
    displayCount: 0,
    hasActiveListFilters: false,
    shareUrl: '',
    shareToken: '',
    shareExpiresAt: '',
    shareBusy: false,
    shareApplicantIds: [],
    showPickSharePanel: false,
    merchantNotesByApplicant: {},
    pickSharePosterUrl: '',
    publishLinkPendingCount: 0,
    publishLinkSubmittedCount: 0,
    batchVerifyPublishLinksBusy: false,
    detailViewMode: false,
  },
  _sharePollTimer: null,
  onShow() {
    syncPrPageChrome(this, { animate: false })
    this.setData({ chatEnabled: chat.canChat() && userProfile.readIdentity() === 'pr' })
    if (this.data.mpOrderId) this.loadOrder()
  },
  onUnload() {
    if (this._sharePollTimer) clearInterval(this._sharePollTimer)
  },
  onLoad(options) {
    syncPrPageChrome(this, { animate: false })
    require('../../../utils/mpShare.js').enableShareMenu()
    const mpOrderId = options && options.id ? decodeURIComponent(options.id) : ''
    const detailViewMode = String((options && options.view) || '').trim() === 'selected'
    if (detailViewMode) {
      wx.setNavigationBarTitle({ title: '商单明细' })
    }
    this.setData({ mpOrderId, detailViewMode, filterSelectedOnly: detailViewMode })
    if (!mpOrderId) {
      this.setData({ loading: false, err: '缺少招募单号' })
      return
    }
    this.loadOrder()
  },
  loadPickSharePosterPreview() {
    const merchantNotifySharePoster = require('../../../utils/merchantNotifySharePoster.js')
    return merchantNotifySharePoster.prepareTalentReviewPosterPreview().then((path) => {
      if (path) this.setData({ pickSharePosterUrl: path })
    })
  },
  onPullDownRefresh() {
    this.loadOrder().finally(() => wx.stopPullDownRefresh())
  },
  applyApplicantsState(applicants, selectedIds, opts) {
    const ids = selection.normalizeSelectedIds(selectedIds)
    const notesMap = (opts && opts.merchantNotesByApplicant) || this.data.merchantNotesByApplicant || {}
    const stampedRaw = selection.stampApplicantsSelected(applicants, ids)
    const stamped = stampedRaw.map((a) => {
      if (!a || !a.id) return a
      const note = notesMap[String(a.id)]
      return note
        ? {
            ...a,
            merchantShareNote: note.noteText,
            merchantShareNoteMeta: `${note.visitorName || '商家'} · ${note.updatedAt || ''}`,
          }
        : a
    })
    const selectedApplicants = selection.filterSelectedApplicants(stamped, ids)
    const filterSelectedOnly =
      opts && opts.filterSelectedOnly != null ? opts.filterSelectedOnly : this.data.filterSelectedOnly
    const listFilters = (opts && opts.listFilters) || this.data.listFilters || EMPTY_LIST_FILTERS
    let displayApplicants = applicantExtras.filterApplicantRows(stamped, listFilters)
    if (filterSelectedOnly) displayApplicants = displayApplicants.filter((a) => a && a.selected)
    const hasActiveListFilters = !!(
      listFilters.searchQuery ||
      listFilters.filterSalesLevel ||
      listFilters.filterTag ||
      listFilters.filterNotified
    )
    const notifiedCount = (stamped || []).filter((a) => a && a.selectionNotified).length
    const publishStats = countPublishLinkStats(stamped)
    this.setData({
      applicants: stamped,
      displayApplicants,
      filterSelectedOnly,
      selectedIds: ids,
      selectedCount: ids.length,
      notifiedCount,
      publishLinkPendingCount: publishStats.publishLinkPendingCount,
      publishLinkSubmittedCount: publishStats.publishLinkSubmittedCount,
      selectedApplicants,
      listFilters,
      displayCount: displayApplicants.length,
      hasActiveListFilters,
    })
  },
  recomputeDisplayApplicants(listFilters) {
    const filters = listFilters || this.data.listFilters || EMPTY_LIST_FILTERS
    let rows = applicantExtras.filterApplicantRows(this.data.applicants || [], filters)
    if (this.data.filterSelectedOnly) rows = rows.filter((a) => a && a.selected)
    const hasActiveListFilters = !!(
      filters.searchQuery ||
      filters.filterSalesLevel ||
      filters.filterTag ||
      filters.filterNotified
    )
    this.setData({
      listFilters: filters,
      displayApplicants: rows,
      displayCount: rows.length,
      hasActiveListFilters,
    })
  },
  onFilterSearchInput(e) {
    const filters = { ...(this.data.listFilters || EMPTY_LIST_FILTERS), searchQuery: e.detail.value }
    this.recomputeDisplayApplicants(filters)
  },
  onFilterSalesLevelChange(e) {
    const idx = Number(e.detail.value) || 0
    const lv = idx > 0 ? String((this.data.salesLevelOptions || [])[idx - 1] || '') : ''
    const filters = { ...(this.data.listFilters || EMPTY_LIST_FILTERS), filterSalesLevel: lv }
    this.setData({ filterSalesLevelIndex: idx })
    this.recomputeDisplayApplicants(filters)
  },
  onFilterTagChange(e) {
    const idx = Number(e.detail.value) || 0
    const tag = idx > 0 ? String((this.data.tagFilterOptions || [])[idx - 1] || '') : ''
    const filters = { ...(this.data.listFilters || EMPTY_LIST_FILTERS), filterTag: tag }
    this.setData({ filterTagIndex: idx })
    this.recomputeDisplayApplicants(filters)
  },
  onFilterNotifiedChange(e) {
    const idx = Number(e.detail.value) || 0
    const opts = this.data.filterNotifiedOptions || []
    const pick = opts[idx] || opts[0]
    const filters = { ...(this.data.listFilters || EMPTY_LIST_FILTERS), filterNotified: pick.id }
    this.setData({ filterNotifiedIndex: idx })
    this.recomputeDisplayApplicants(filters)
  },
  onClearListFilters() {
    this.setData({ filterSalesLevelIndex: 0, filterTagIndex: 0, filterNotifiedIndex: 0 })
    this.recomputeDisplayApplicants(EMPTY_LIST_FILTERS)
  },
  async enrichApplicantsWithStats(applicants, mp) {
    if (!applicants || !applicants.length) return applicants
    try {
      const platform = String((mp && mp.platform) || '抖音')
      const talents = applicants.map((a) => ({
        key: String(a.id),
        talentMemberId: String(a.talentMemberId || '').trim() || undefined,
        platformAccount: String(a.platformAccount || '').trim() || undefined,
        wxOpenId: String(a.wxOpenId || '').trim() || undefined,
        platform,
      }))
      const [statsMap, trustRes] = await Promise.all([
        talentPrPricing.fetchTalentCooperationStats(talents).catch(() => ({})),
        xingxuanEnhance.batchApplicantTrust(talents).catch(() => null),
      ])
      const credits = (trustRes && trustRes.credits) || {}
      const watchlist = (trustRes && trustRes.watchlist) || {}
      const cooperation = (trustRes && trustRes.cooperation) || {}
      return applicants.map((a) => {
        const key = String(a.id)
        const credit = credits[key]
        const pool = cooperation[key]
        const wl = watchlist[key]
        const coopTags = pool && Array.isArray(pool.tags) ? pool.tags : []
        return {
          ...a,
          cooperationStatsLabel: talentPrPricing.formatCooperationStatsLabel(statsMap[key]),
          creditLabel: formatCreditShort(credit),
          creditScore: credit ? credit.score : 0,
          watchlistBadge: formatWatchlistBadge(wl),
          watchlistList: wl && wl.list ? wl.list : '',
          watchlistReason: wl && wl.entry ? wl.entry.reason || '' : '',
          inCooperationPool: !!pool,
          cooperationPoolTags: coopTags,
          cooperationPoolEntryId: pool ? pool.id : '',
        }
      })
    } catch (_) {
      return applicants
    }
  },
  async loadOrder() {
    const { mpOrderId } = this.data
    if (!mpOrderId) return
    if (!api.hasApi()) {
      this.setData({ loading: false, err: '未配置后台地址，无法拉取报名' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry({
        includeMpOrderIds: [this.data.mpOrderId],
      })
      const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === mpOrderId)
      if (!mp) {
        this.setData({
          loading: false,
          err: '未找到该招募单，请下拉刷新',
          applicants: [],
          mpOrder: null,
        })
        return
      }
      const meta = heroMeta.buildMpOrderHeroMeta(mp)
      const isIce = iceOrderStats.isIceMpOrder(mp)
      const iceVerifyMode = iceOrderStats.getIceVerifyMode(mp)
      const iceStats = iceOrderStats.countIceOrderStats(mp)
      const prStatus = mpOrderIce.resolveIcePrStatus(mp)
      const prStatusLabel = mpOrderIce.displayStatusLabel(prStatus, mp, 'pr')
      let icePendingReview = 0
      let selectedIds = selection.selectedIdsFromMp(mp)
      if (!selectedIds.length) {
        const local = selection.readLocalSelectedIds(mpOrderId)
        selectedIds = selection.pruneSelectedIdsToApplicants(mp.applicants, local)
      }
      const needsSelectedCleanup =
        selection.normalizeSelectedIds(mp.selectedApplicantIds).length > selectedIds.length
      const baseApplicants = (mp.applicants || []).map((a, i) => {
        const row = {
          ...appDisplay.enrichApplicantRow(a, i, reg, mp),
          applyFormDisplayRows: applicantApplyFormDisplay.buildApplicantApplyFormDisplayRows(a, mp),
        }
        if (!isIce) return row
        const canReview = iceOrderStats.canReviewIceLink(a, mp)
        if (canReview) icePendingReview += 1
        return {
          ...row,
          iceTaskStatus: iceOrderStats.applicantTaskStatusLabel(a),
          iceDouyinUrl: String(a.douyinPublishUrl || a.videoUrl || '').trim(),
          iceRejectReason: String(a.videoRejectReason || a.aiVerifyNote || '').trim(),
          canReviewIceLink: canReview,
        }
      })
      const applicants = applicantExtras.enrichAndSortApplicants(baseApplicants, reg, mp, mpOrderId)
      const tagFilterOptions = applicantExtras.collectApplicantTagOptions(applicants)
      const salesLevelOptions = applicantExtras.collectSalesLevelOptions(applicants)
      this.setData({
        loading: false,
        title: mp.title || mp.customerName || mpOrderId,
        orderNo: meta.orderNo,
        publishedAt: meta.publishedAt,
        deadlineText: meta.deadlineText,
        status: mp.status || 'open',
        statusLabel: isIce ? prStatusLabel : appDisplay.statusLabel(mp.status),
        hallLabel: appDisplay.hallLabelFromMp(mp),
        isIce,
        iceVerifyMode,
        iceClaimed: iceStats.claimed,
        iceCompleted: iceStats.completed,
        icePendingReview,
        canCompleteIce: mpOrderIce.canPrCompleteIceOrder(mp),
        mpOrder: mp,
        groupQrImage: mpGroupQr.groupQrFromRegistry(reg, mpOrderId) || mpGroupQr.groupQrFromMp(mp),
        groupQrExpired: mpGroupQr.isGroupQrExpired(mp),
        showGroupQrPreview: false,
        showPickSharePanel: false,
        err: '',
        tagFilterOptions,
        salesLevelOptions,
      })
      this.applyApplicantsState(applicants, selectedIds, {
        listFilters: this.data.listFilters,
        filterSelectedOnly: this.data.detailViewMode ? true : this.data.filterSelectedOnly,
      })
      if (needsSelectedCleanup) {
        void selection.persistSelectedIds(mpOrderId, selectedIds, mp.applicants).catch(() => {})
      }
      if (!isIce) {
        void this.enrichApplicantsWithStats(applicants, mp).then((enriched) => {
          if (String(this.data.mpOrderId || '') !== String(mpOrderId)) return
          this.applyApplicantsState(enriched, this.data.selectedIds, {
            listFilters: this.data.listFilters,
            filterSelectedOnly: this.data.detailViewMode ? true : this.data.filterSelectedOnly,
          })
        })
      }
      if (!this._sharePollTimer && !isIce) {
        this._sharePollTimer = setInterval(() => void this.loadShareFeedback(mpOrderId), 8000)
      }
      void this.loadShareFeedback(mpOrderId)
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e).slice(0, 80),
      })
    }
  },
  async onBatchVerifyPublishLinks() {
    if (!this.data.detailViewMode || this.data.batchVerifyPublishLinksBusy || this.data.isIce) return
    const submitted = Number(this.data.publishLinkSubmittedCount || 0)
    if (submitted <= 0) {
      wx.showToast({ title: '暂无已回传链接可检核', icon: 'none' })
      return
    }
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: 'AI 批量链接检核',
        content: `将对 ${submitted} 条已回传链接比对审核通过成片开头画面（约前 3 秒）。`,
        success: (res) => resolve(!!res.confirm),
      })
    })
    if (!ok) return
    this.setData({ batchVerifyPublishLinksBusy: true })
    try {
      const data = await publishLinkUtil.batchVerifyPublishLinks(this.data.mpOrderId)
      const msg = String((data && data.message) || '检核完成')
      wx.showModal({ title: '检核完成', content: msg, showCancel: false })
      await this.loadOrder()
    } catch (e) {
      const msg = publishLinkUtil.formatErrorMessage(e, '批量检核失败')
      wx.showModal({ title: '检核失败', content: msg.slice(0, 240), showCancel: false })
    } finally {
      this.setData({ batchVerifyPublishLinksBusy: false })
    }
  },
  onToggleCheck(e) {
    const id = String(e.currentTarget.dataset.id || '').trim()
    if (!id) return
    const set = new Set(this.data.checkedIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    const checkedIds = [...set]
    this.setData({ checkedIds, checkedCount: checkedIds.length })
  },
  async onBatchConfirm() {
    if (this.data.batchConfirming || this.data.savingSelect) return
    const checked = this.data.checkedIds.filter((id) => !this.data.selectedIds.includes(id))
    if (!checked.length) {
      wx.showToast({
        title: this.data.checkedCount ? '勾选的已在已选名单' : '请先勾选达人',
        icon: 'none',
      })
      return
    }
    const next = [...new Set([...this.data.selectedIds, ...checked])]
    this.applyApplicantsState(this.data.applicants, next)
    this.setData({ checkedIds: [], checkedCount: 0, batchConfirming: true })
    try {
      await selection.persistSelectedIds(this.data.mpOrderId, next, this.data.applicants)
      const mp = { ...this.data.mpOrder, selectedApplicantIds: next }
      this.setData({ mpOrder: mp })
      wx.showToast({ title: `已确认 ${checked.length} 人`, icon: 'success' })
    } catch (err) {
      wx.showToast({ title: String(err.message || '批量确认失败').slice(0, 28), icon: 'none' })
      await this.loadOrder()
    } finally {
      this.setData({ batchConfirming: false })
    }
  },
  async onToggleSelect(e) {
    if (this.data.detailViewMode) return
    const id = String(e.currentTarget.dataset.id || '').trim()
    const a = findApplicantById(this.data.applicants, id)
    if (!a || !a.id || this.data.savingSelect) return
    const set = new Set(this.data.selectedIds)
    if (set.has(a.id)) set.delete(a.id)
    else set.add(a.id)
    const selectedIds = [...set]
    const filterSelectedOnly = selectedIds.length ? this.data.filterSelectedOnly : false
    this.applyApplicantsState(this.data.applicants, selectedIds, { filterSelectedOnly })
    this.setData({ savingSelect: true })
    try {
      await selection.persistSelectedIds(this.data.mpOrderId, selectedIds, this.data.applicants)
      const mp = { ...this.data.mpOrder, selectedApplicantIds: selectedIds }
      this.setData({ mpOrder: mp })
    } catch (err) {
      wx.showToast({ title: String(err.message || '保存失败').slice(0, 28), icon: 'none' })
      await this.loadOrder()
    } finally {
      this.setData({ savingSelect: false })
    }
  },
  onViewSelected() {
    if (this.data.detailViewMode) return
    if (!this.data.filterSelectedOnly && !this.data.selectedCount) {
      wx.showToast({ title: '请先确认选择达人', icon: 'none' })
      return
    }
    const filterSelectedOnly = !this.data.filterSelectedOnly
    this.applyApplicantsState(this.data.applicants, this.data.selectedIds, { filterSelectedOnly })
  },
  onCloseSelectedPanel() {
    this.setData({ showSelectedPanel: false })
  },
  async onDeselectFromPanel(e) {
    const id = String(e.currentTarget.dataset.id || '').trim()
    if (!id || this.data.savingSelect) return
    const selectedIds = this.data.selectedIds.filter((x) => x !== id)
    this.applyApplicantsState(this.data.applicants, selectedIds)
    if (!selectedIds.length) this.setData({ showSelectedPanel: false })
    this.setData({ savingSelect: true })
    try {
      await selection.persistSelectedIds(this.data.mpOrderId, selectedIds, this.data.applicants)
      const mp = { ...this.data.mpOrder, selectedApplicantIds: selectedIds }
      this.setData({ mpOrder: mp })
      wx.showToast({ title: '已取消选择', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: String(err.message || '保存失败').slice(0, 28), icon: 'none' })
      await this.loadOrder()
    } finally {
      this.setData({ savingSelect: false })
    }
  },
  async runExport(list, flagKey) {
    if (!list.length) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' })
      return
    }
    if (this.data[flagKey]) return
    this.setData({ [flagKey]: true })
    wx.showLoading({ title: '生成 Excel…', mask: true })
    try {
      const res = await exportApplicantsExcel(list, this.data.mpOrderId)
      showExportResultToast(res)
    } catch (e) {
      wx.showToast({
        title: formatExportError(e).slice(0, 36),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ [flagKey]: false })
    }
  },
  onExportAll() {
    this.runExport(this.data.applicants, 'exportingAll')
  },
  onPreviewGroupQr() {
    const url = this.data.groupQrImage
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  onViewDetailGroupQr() {
    if (!this.data.detailViewMode) return
    if (this.data.groupQrExpired) {
      wx.showToast({ title: '报名截止已满7天，群码已自动清理', icon: 'none' })
      return
    }
    const url = String(this.data.groupQrImage || '').trim()
    if (!url) {
      wx.showToast({ title: '暂无群二维码', icon: 'none' })
      return
    }
    this.setData({ showGroupQrPreview: !this.data.showGroupQrPreview })
  },
  onToggleGroupQrPreview() {
    if (!this.data.groupQrImage) return
    const next = !this.data.showGroupQrPreview
    this.setData({
      showGroupQrPreview: next,
      showPickSharePanel: next ? false : this.data.showPickSharePanel,
    })
  },
  async onUploadGroupQr() {
    if (this.data.groupQrUploading) return
    if (this.data.groupQrExpired) {
      wx.showToast({ title: '报名截止已满7天，群码已自动清理', icon: 'none' })
      return
    }
    if (this.data.groupQrImage) {
      this.onToggleGroupQrPreview()
      return
    }
    await this.uploadGroupQrImage()
  },
  async onReplaceGroupQr() {
    if (this.data.groupQrUploading || this.data.groupQrExpired) return
    await this.uploadGroupQrImage()
  },
  async onDeleteGroupQr() {
    if (this.data.groupQrUploading || this.data.groupQrExpired) return
    if (!this.data.groupQrImage) return
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '删除群二维码',
        content: '删除后需重新上传才能通知达人，是否继续？',
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!confirmed) return
    this.setData({ groupQrUploading: true })
    wx.showLoading({ title: '删除中…', mask: true })
    try {
      await mpGroupQr.clearGroupQrImage(this.data.mpOrderId)
      const mp = { ...this.data.mpOrder }
      delete mp.groupQrImage
      if (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object') {
        delete mp.mpPublishMeta.groupQrImage
      }
      this.setData({ groupQrImage: '', showGroupQrPreview: false, mpOrder: mp })
      wx.showToast({ title: '已删除群二维码', icon: 'success' })
    } catch (e) {
      wx.showToast({
        title: String(e && e.message ? e.message : e).slice(0, 28),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ groupQrUploading: false })
    }
  },
  async uploadGroupQrImage() {
    try {
      const filePath = await mpGroupQr.chooseAndReadImageDataUrl()
      this.setData({ groupQrUploading: true })
      wx.showLoading({ title: '上传中…', mask: true })
      const patchResult = await mpGroupQr.patchGroupQrImage(this.data.mpOrderId, filePath)
      const imageUrl = String((patchResult && patchResult.imageUrl) || filePath || '').trim()
      const mp = { ...this.data.mpOrder, groupQrImage: imageUrl }
      this.setData({
        groupQrImage: imageUrl,
        mpOrder: mp,
        showGroupQrPreview: true,
        showPickSharePanel: false,
      })
      wx.showToast({ title: '群二维码已保存', icon: 'success' })
    } catch (e) {
      const msg = String(e && e.message ? e.message : e)
      if (msg !== 'cancel') {
        if (e && e.localSaved) {
          const mp = { ...this.data.mpOrder, groupQrImage: this.data.groupQrImage }
          this.setData({ mpOrder: mp })
        }
        wx.showToast({ title: msg.slice(0, 28), icon: 'none', duration: 2800 })
      }
    } finally {
      wx.hideLoading()
      this.setData({ groupQrUploading: false })
    }
  },
  async onNotifySelected() {
    if (this.data.notifying) return
    const selected = this.data.selectedApplicants
    if (!selected.length) {
      wx.showToast({ title: '请先确认选择达人', icon: 'none' })
      return
    }
    const qr = String(this.data.groupQrImage || '').trim()
    if (!qr) {
      wx.showToast({ title: '请先上传群二维码', icon: 'none' })
      return
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '通知已选达人',
        content: `将向 ${selected.length} 位达人发送站内信（含群二维码图片）。是否继续？`,
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!confirmed) return
    this.setData({ notifying: true })
    wx.showLoading({ title: '发送中…', mask: true })
    try {
      const syncedQr = await mpGroupQr.resolveGroupQrForNotify(this.data.mpOrderId, qr)
      this.setData({ groupQrImage: syncedQr })
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [this.data.mpOrderId] })
      const title = this.data.title || this.data.mpOrderId
      const entries = []
      const skipped = []
      for (const a of selected) {
        const target = talentInboxMatch.resolveTalentInboxTarget(a, reg)
        if (!target.talentMemberId) {
          skipped.push(a.displayName || a.id)
          continue
        }
        entries.push({
          talentMemberId: target.talentMemberId,
          contact: target.contact,
          platformAccount: target.platformAccount,
          applicantId: target.applicantId,
          mpOrderId: this.data.mpOrderId,
          category: 'business',
          title: '恭喜入选招募',
          body: `您已被 PR 选入「${title}」（单号 ${this.data.orderNo}）。请扫码加入项目群，二维码见下图。`,
          noticeType: 'selection',
          imageUrl: syncedQr,
          pinned: true,
        })
      }
      if (!entries.length) {
        wx.showToast({ title: '所选达人缺少手机号或平台账号', icon: 'none' })
        return
      }
      await ops.appendTalentInbox(entries)
      let linkeSyncMsg = ''
      const mpRaw = this.data.mpOrder
      if (
        mpRaw &&
        prDouyinCpsSync.isPrLinkeOrder(mpRaw) &&
        prDouyinCpsSync.shouldAutoSyncPrLinkeCps(mpRaw, this.data.selectedIds)
      ) {
        const pr = userProfile.readPrProfile() || userProfile.emptyPrProfile()
        const sync = await prDouyinCpsSync.autoSyncPrLinkeCpsOnNotify({
          mpOrder: mpRaw,
          selectedApplicantIds: this.data.selectedIds,
          applicants: this.data.applicants || [],
          merchantPhoneFallback: pr.contactPhone,
        })
        if (sync.ok) linkeSyncMsg = `\n\n林客：${sync.message}`
        else if (!sync.skipped) linkeSyncMsg = `\n\n林客同步失败：${sync.message}`
      }
      const notifiedIds = entries.map((e) => String(e.applicantId || '').trim()).filter(Boolean)
      if (notifiedIds.length) {
        const stamped = (this.data.applicants || []).map((a) =>
          a && notifiedIds.includes(String(a.id || '')) ? { ...a, selectionNotified: true } : a,
        )
        const mpOrder = this.data.mpOrder
        const prevNotified =
          mpOrder && Array.isArray(mpOrder.notifiedApplicantIds) ? mpOrder.notifiedApplicantIds : []
        const mergedOrder = mpOrder
          ? {
              ...mpOrder,
              notifiedApplicantIds: [...new Set([...prevNotified.map(String), ...notifiedIds])],
            }
          : mpOrder
        this.applyApplicantsState(stamped, this.data.selectedIds, { listFilters: this.data.listFilters })
        if (mergedOrder) this.setData({ mpOrder: mergedOrder })
      }
      wx.showToast({
        title: skipped.length ? `已通知 ${entries.length} 人` : '通知已发送',
        icon: 'success',
      })
      wx.showModal({
        title: '已写入站内信',
        content:
          '订单已进入待排期。达人请在「我的 → 消息通知」中查看（非底部「消息」私信页）。' + linkeSyncMsg,
        showCancel: false,
      })
      if (skipped.length) {
        setTimeout(() => {
          wx.showModal({
            title: '部分未通知',
            content: `${skipped.slice(0, 5).join('、')}${skipped.length > 5 ? ' 等' : ''} 未匹配到达人会员，请引导其完善「我的信息」后重试。`,
            showCancel: false,
          })
        }, 400)
      }
      await this.loadOrder()
    } catch (e) {
      wx.showToast({
        title: mpApiErrors.formatMpApiErr(e, '通知发送失败，请稍后重试').slice(0, 36),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ notifying: false })
    }
  },
  async onChatApplicant(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a || !a.id) return
    if (!this.data.chatEnabled) {
      wx.showToast({ title: '请先配置后台地址', icon: 'none' })
      return
    }
    this.setData({ chattingId: a.id })
    wx.showLoading({ title: '连接中' })
    try {
      await chat.syncProfile()
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [this.data.mpOrderId] })
      const sessionId = await chat.ensureSessionWithTalent(
        {
          id: a.id,
          talentMemberId: a.talentMemberId || a.id,
          name: a.displayName || a.platformNickname || '达人',
          avatar: a.avatar || '',
        },
        reg,
      )
      wx.hideLoading()
      wx.navigateTo({
        url:
          `/pages/subpack-pr/chat/chat?sessionId=${encodeURIComponent(sessionId)}` +
          `&peerName=${encodeURIComponent(a.displayName || '达人')}` +
          `&peerAvatar=${encodeURIComponent(a.avatar || '')}`,
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: String(err.message || '无法发起会话').slice(0, 36), icon: 'none' })
    } finally {
      this.setData({ chattingId: '' })
    }
  },
  onOpenProfile(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a) return
    appDisplay.copyTalentProfileLink(a.profileLink)
  },
  resolveShareApplicantIds() {
    const selected = (this.data.selectedIds || []).filter(Boolean)
    if (selected.length) return selected
    const checked = (this.data.checkedIds || []).filter(Boolean)
    if (checked.length) return checked
    const displayed = (this.data.displayApplicants || []).map((a) => String(a.id || '')).filter(Boolean)
    if (displayed.length) return displayed
    return []
  },
  async loadShareFeedback(mpOrderId) {
    if (!mpOrderId || !api.hasApi() || this.data.isIce) return
    try {
      const fb = await applicantPickShare.fetchFeedback(mpOrderId)
      this.setData({
        shareUrl: fb.shareUrl || this.data.shareUrl,
        shareToken: fb.token || this.data.shareToken,
        shareExpiresAt: fb.expiresAt || this.data.shareExpiresAt,
        shareApplicantIds: fb.applicantIds || this.data.shareApplicantIds,
        merchantNotesByApplicant: fb.byApplicant || {},
      })
      this.applyApplicantsState(this.data.applicants, this.data.selectedIds, {
        listFilters: this.data.listFilters,
        merchantNotesByApplicant: fb.byApplicant || {},
      })
    } catch (_) {
      /* 分享表未迁移时静默 */
    }
  },
  buildPickSharePayload(token, count) {
    const merchantNotifySharePoster = require('../../../utils/merchantNotifySharePoster.js')
    const title = String(this.data.title || '报名明细').trim()
    const mpOrderId = this.data.mpOrderId
    const path = token
      ? `/pages/subpack-pr/applicant-pick-share/applicant-pick-share?token=${encodeURIComponent(token)}`
      : mpOrderId
        ? `/pages/subpack-pr/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(mpOrderId)}`
        : '/pages/subpack-pr/mine-pr-order-applicants/mine-pr-order-applicants'
    const shareTitle = token
      ? `${title} · 达人审核（${count || 0}人）`
      : `${title} · 报名管理`
    return merchantNotifySharePoster.attachTalentReviewShare({ title, path })
  },
  onTogglePickSharePanel() {
    if (this.data.isIce) return
    if (this.data.showPickSharePanel) {
      this.setData({ showPickSharePanel: false })
      return
    }
    const applicantIds = this.resolveShareApplicantIds()
    if (!applicantIds.length) {
      wx.showToast({ title: '请先选择或筛选达人', icon: 'none' })
      return
    }
    this.setData({ showPickSharePanel: true, showGroupQrPreview: false })
    void this.loadPickSharePosterPreview()
  },
  onPreparePickShareTap() {
    if (this.data.isIce) return
    const applicantIds = this.resolveShareApplicantIds()
    if (!applicantIds.length) {
      wx.showToast({ title: '请先选择或筛选达人', icon: 'none' })
    }
  },
  async ensurePickShareLink() {
    const mpOrderId = this.data.mpOrderId
    if (!mpOrderId || this.data.isIce || this.data.shareBusy) return null
    const applicantIds = this.resolveShareApplicantIds()
    if (!applicantIds.length) {
      wx.showToast({ title: '请先选择或筛选达人', icon: 'none' })
      return null
    }
    this.setData({ shareBusy: true })
    try {
      const r = await applicantPickShare.createShareLink(mpOrderId, applicantIds)
      this.setData({
        shareUrl: r.shareUrl,
        shareToken: r.token,
        shareExpiresAt: r.expiresAt,
        shareApplicantIds: r.applicantIds,
      })
      return r
    } catch (e) {
      wx.showToast({
        title: String(e && e.message ? e.message : e).slice(0, 28),
        icon: 'none',
      })
      return null
    } finally {
      this.setData({ shareBusy: false })
    }
  },
  async onRevokePickShare() {
    const mpOrderId = this.data.mpOrderId
    if (!mpOrderId || this.data.shareBusy) return
    this.setData({ shareBusy: true })
    try {
      await applicantPickShare.revokeShareLink(mpOrderId)
      this.setData({
        shareUrl: '',
        shareToken: '',
        shareExpiresAt: '',
        shareApplicantIds: [],
        showPickSharePanel: false,
      })
      wx.showToast({ title: '分享已失效', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: String(e && e.message ? e.message : e).slice(0, 28), icon: 'none' })
    } finally {
      this.setData({ shareBusy: false })
    }
  },
  onShareAppMessage() {
    const mpShare = require('../../../utils/mpShare.js')
    mpShare.enableShareMenu()
    const self = this
    if (this.data.isIce) {
      return this.buildPickSharePayload('', 0)
    }
    const token = String(
      this.data.shareToken || applicantPickShare.extractShareToken(this.data.shareUrl) || '',
    ).trim()
    if (token) {
      return this.buildPickSharePayload(token, (this.data.shareApplicantIds || []).length)
    }
    const fallback = this.buildPickSharePayload('', 0)
    return {
      ...fallback,
      promise: this.ensurePickShareLink()
        .then((r) => {
          if (!r || !r.token) return fallback
          return self.buildPickSharePayload(r.token, (r.applicantIds || []).length)
        })
        .catch(() => fallback),
    }
  },
  noop() {},
  onCopyApplicant(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a) return
    const tagLine =
      Array.isArray(a.accountTags) && a.accountTags.length ? a.accountTags.join('、') : ''
    const applyFormLines = applicantApplyFormDisplay.formatApplyFormDisplayLines(a.applyFormDisplayRows)
    const lines = [
      `昵称：${a.displayName}`,
      `平台：${a.platform || ''}`,
      `账号：${a.platformAccount || ''}`,
      `粉丝：${a.displayFollowers}`,
      tagLine ? `达人标签：${tagLine}` : '',
      `带货等级：${a.displaySalesLevel || a.douyinSalesLevel || '—'}`,
      `报价：${a.quotePrice || ''}`,
      a.visitTimeSlot ? `探店：${a.visitTimeSlot}` : '',
      `联系：${a.contact || ''}`,
      `微信：${a.wechatId || ''}`,
      `主页：${a.profileLink || ''}`,
      ...applyFormLines,
      a.iceDouyinUrl ? `抖音链接：${a.iceDouyinUrl}` : '',
      a.iceTaskStatus ? `任务状态：${a.iceTaskStatus}` : '',
      a.selected ? '状态：已入选' : '',
    ].filter(Boolean)
    wx.setClipboardData({ data: lines.join('\n') })
  },
  onCopyIceLink(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    const url = a && a.iceDouyinUrl ? String(a.iceDouyinUrl) : ''
    if (!url) return
    wx.setClipboardData({ data: url })
  },
  async onIcePass(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a || !a.id || this.data.iceReviewBusyId) return
    this.setData({ iceReviewBusyId: a.id })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await videoUpload.reviewVideo(this.data.mpOrderId, a.id, 'pass')
      wx.showToast({ title: '已通过', icon: 'success' })
      await this.loadOrder()
    } catch (err) {
      wx.showToast({ title: String(err.message || '审核失败').slice(0, 28), icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ iceReviewBusyId: '' })
    }
  },
  onIceOpenReject(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a || !a.id) return
    this.setData({
      iceRejectModal: true,
      iceRejectTargetId: a.id,
      iceRejectTargetName: a.displayName || '达人',
      iceRejectReason: '',
    })
  },
  onIceRejectReasonInput(e) {
    this.setData({ iceRejectReason: String((e.detail && e.detail.value) || '') })
  },
  onIceCloseReject() {
    this.setData({
      iceRejectModal: false,
      iceRejectTargetId: '',
      iceRejectTargetName: '',
      iceRejectReason: '',
    })
  },
  async onIceConfirmReject() {
    const id = this.data.iceRejectTargetId
    const reason = String(this.data.iceRejectReason || '').trim()
    if (!id || !reason || this.data.iceReviewBusyId) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' })
      return
    }
    this.setData({ iceReviewBusyId: id })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await videoUpload.reviewVideo(this.data.mpOrderId, id, 'reject', reason)
      wx.showToast({ title: '已驳回', icon: 'success' })
      this.onIceCloseReject()
      await this.loadOrder()
    } catch (err) {
      wx.showToast({ title: String(err.message || '驳回失败').slice(0, 28), icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ iceReviewBusyId: '' })
    }
  },
  onVisitSlotsInput(e) {
    this.setData({ visitSlots: String((e.detail && e.detail.value) || '') })
  },
  onVisitDateChange(e) {
    this.setData({ visitDate: String((e.detail && e.detail.value) || '') })
  },
  onShareTableToggle() {
    this.setData({ shareTable: !this.data.shareTable })
  },
  async onAiVisitSchedule() {
    const mpOrderId = this.data.mpOrderId
    const mp = this.data.mpOrder
    if (!mpOrderId || !mp) return
    const selected = (mp.applicants || []).filter(
      (a) => a && this.data.selectedIds.indexOf(String(a.id)) >= 0,
    )
    if (!selected.length) {
      wx.showToast({ title: '请先确认选择达人', icon: 'none' })
      return
    }
    this.setData({ scheduleBusy: true })
    try {
      const slots = String(this.data.visitSlots || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const { rows } = await visitScheduleRuntime.generateAiVisitSchedule(selected, {
        visitSlots: slots,
        storeName: String(mp.storeName || this.data.title || '门店'),
        shareTable: this.data.shareTable,
        mealCount: this.data.mealCount,
        tableSize: this.data.tableSize,
        category: String(mp.category || ''),
        title: String(mp.title || this.data.title || ''),
      })
      if (!rows.length) {
        wx.showToast({ title: '无已选达人可排期', icon: 'none' })
        return
      }
      await visitScheduleRuntime.setVisitSchedule(mpOrderId, {
        mode: 'ai',
        aiRows: rows.map((r) => {
          const hit = selected.find((a) => String(a.id) === r.applicantId)
          return {
            time: r.time,
            talentName: String((hit && (hit.platformNickname || hit.name)) || r.applicantId),
            storeName: r.storeName,
            tableNote: r.tableNote,
          }
        }),
        visitSlots: slots,
        category: String(mp.category || ''),
        shareTable: this.data.shareTable,
        mealCount: this.data.mealCount,
        tableSize: this.data.tableSize,
        storeName: String(mp.storeName || ''),
        notify: true,
        confirmEffective: true,
      })
      const mpOrderRegistryOps = require('../../../utils/mpOrderRegistryOps.js')
      const prWorkflow = require('../../../utils/prOrderWorkflowStage.js')
      await this.loadOrder()
      const freshMp = this.data.mpOrder
      if (freshMp && prWorkflow.isVisitScheduleDone(freshMp) && prWorkflow.resolvePrWorkflowStage(freshMp) === 'pending_schedule') {
        await mpOrderRegistryOps.patchPrWorkflow(freshMp, prWorkflow.buildScheduleCompletedPatch(freshMp))
        await this.loadOrder()
      }
      wx.showToast({
        title: '已移入待视频审核',
        icon: 'success',
      })
    } catch (e) {
      wx.showToast({ title: String((e && e.message) || e).slice(0, 24), icon: 'none' })
    } finally {
      this.setData({ scheduleBusy: false })
    }
  },
  onCompleteIceOrder() {
    if (this.data.completingIce || !this.data.canCompleteIce) return
    wx.showModal({
      title: '完成云剪订单',
      content: '确认所有达人视频链接均已审核通过后，将订单标记为已完成。',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ completingIce: true })
        wx.showLoading({ title: '提交中…', mask: true })
        try {
          await mpOrderRegistryOps.patchMpRecruitmentOrderStatus(this.data.mpOrderId, 'done')
          wx.showToast({ title: '订单已完成', icon: 'success' })
          await this.loadOrder()
        } catch (err) {
          wx.showToast({
            title: String(err && err.message ? err.message : err).slice(0, 28),
            icon: 'none',
          })
        } finally {
          wx.hideLoading()
          this.setData({ completingIce: false })
        }
      },
    })
  },
  async onAddToCooperationPool(e) {
    const id = e.currentTarget.dataset.id
    const a = findApplicantById(this.data.applicants, id)
    if (!a) return
    try {
      await xingxuanEnhance.upsertCooperation({
        talentMemberId: a.talentMemberId,
        displayName: a.displayName || a.platformNickname || a.name,
        platform: a.platform || a.displayPlatform,
        tags: ['已合作'],
        lastCoopAt: new Date().toISOString(),
      })
      wx.showToast({ title: '已加入合作池' })
      await this.loadOrder()
    } catch (err) {
      wx.showToast({ title: err.message || '失败', icon: 'none' })
    }
  },
  onEditCooperationTags(e) {
    const id = e.currentTarget.dataset.id
    const a = findApplicantById(this.data.applicants, id)
    if (!a) return
    const presets = ['转化好', '配合度高', '出片快', '已合作', '性价比高']
    wx.showActionSheet({
      itemList: presets,
      success: async (res) => {
        const tag = presets[res.tapIndex]
        if (!tag) return
        const prev = Array.isArray(a.cooperationPoolTags) ? a.cooperationPoolTags : []
        const tags = [...new Set([...prev, tag])]
        try {
          await xingxuanEnhance.upsertCooperation({
            id: a.cooperationPoolEntryId || undefined,
            talentMemberId: a.talentMemberId,
            displayName: a.displayName || a.platformNickname || a.name,
            platform: a.platform || a.displayPlatform,
            tags,
            lastCoopAt: new Date().toISOString(),
          })
          wx.showToast({ title: '标签已更新' })
          await this.loadOrder()
        } catch (err) {
          wx.showToast({ title: err.message || '失败', icon: 'none' })
        }
      },
    })
  },
  async onReinviteApplicant(e) {
    const id = e.currentTarget.dataset.id
    const a = findApplicantById(this.data.applicants, id)
    if (!a) return
    const title = this.data.title || this.data.mpOrderId
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '复邀达人',
        content: `向「${a.displayName || a.name}」发送商单复邀站内信？`,
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!confirmed) return
    try {
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [this.data.mpOrderId] })
      const target = talentInboxMatch.resolveTalentInboxTarget(a, reg)
      if (!target.talentMemberId) {
        wx.showToast({ title: '缺少达人会员 ID', icon: 'none' })
        return
      }
      await ops.appendTalentInbox([
        {
          talentMemberId: target.talentMemberId,
          contact: target.contact,
          platformAccount: target.platformAccount,
          applicantId: target.applicantId,
          mpOrderId: this.data.mpOrderId,
          category: 'business',
          title: '合作复邀',
          body: `PR 邀请您再次参与「${title}」（单号 ${this.data.orderNo}），欢迎优先报名。`,
          noticeType: 'cooperation_reinvite',
        },
      ])
      wx.showToast({ title: '复邀已发送', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '发送失败', icon: 'none' })
    }
  },
  onWatchlistApplicant(e) {
    const id = e.currentTarget.dataset.id
    const list = e.currentTarget.dataset.list || 'graylist'
    const a = findApplicantById(this.data.applicants, id)
    if (!a) return
    const listLabel = list === 'blacklist' ? '黑名单' : '灰名单'
    wx.showModal({
      title: `加入${listLabel}`,
      editable: true,
      placeholderText: '备注原因（选填）',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await xingxuanEnhance.watchlistFromApplicant(
            this.data.mpOrderId,
            id,
            list,
            String(res.content || '').trim(),
          )
          wx.showToast({ title: `已加入${listLabel}` })
          await this.loadOrder()
        } catch (err) {
          wx.showToast({ title: err.message || '失败', icon: 'none' })
        }
      },
    })
  },
})
