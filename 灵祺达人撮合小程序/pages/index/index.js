const api = require('../../utils/api.js')
const auth = require('../../utils/auth.js')
const { showDemoOrders } = require('../../utils/mpDemoMode.js')
const { loadHallList } = require('../../utils/hallLoad.js')
const mpBuild = require('../../utils/mpBuild.js')
const listFilters = require('../../utils/recruitmentListFilters.js')
const hallFilters = require('../../utils/recruitmentHallFilters.js')
const recruitmentAi = require('../../utils/recruitmentAiTags.js')
const hallIdentity = require('../../utils/hallIdentityBuckets.js')
const userProfile = require('../../utils/userProfile.js')
const identityTheme = require('../../utils/identityTheme.js')
const { setTabBarForPage } = require('../../utils/tabBar.js')
const mpShare = require('../../utils/mpShare.js')
const listKeywordSearch = require('../../utils/listKeywordSearch.js')
const selectionHomePopup = require('../../utils/selectionHomePopup.js')
const scheduleHomePopup = require('../../utils/scheduleHomePopup.js')
const opsBroadcastHomePopup = require('../../utils/opsBroadcastHomePopup.js')
const mpPlatformDecor = require('../../utils/mpPlatformDecor.js')
const memberStore = require('../../utils/talentMember.js')
const regionFilterPicker = require('../../utils/regionFilterPicker.js')
const hallRegionLocate = require('../../utils/hallRegionLocate.js')
const budgetDisplayUtil = require('../../utils/recruitmentBudgetDisplay.js')
const mpPrivacyPageMixin = require('../../utils/mpPrivacyPageMixin.js')
const mpPrivacyAuthorize = require('../../utils/mpPrivacyAuthorize.js')

const HOME_CATEGORY_CHIPS = [
  { id: 'all', label: '全部' },
  { id: 'visit', label: '探店' },
  { id: 'seed', label: '种草' },
  { id: 'live', label: '直播' },
  { id: 'video', label: '视频' },
  { id: 'more', label: '更多' },
]

const homeBannerAssets = require('../../utils/homeBannerAssets.js')
const mpCdnAssets = require('../../utils/mpCdnAssets.js')

const HOME_BANNER_PR = {
  bannerTitle: '成为灵祺星选 PR',
  bannerSub: '发招募 · 智能荐达人',
  bannerHint: '高效对接达人资源',
  bannerCta: '去认证',
  bannerGirl: homeBannerAssets.heroTalentSearch,
  bannerClouds: homeBannerAssets.homeBannerClouds,
}

const HOME_BANNER_TALENT = {
  bannerTitle: '成为灵祺星选达人',
  bannerSub: '发现更多合作机会',
  bannerHint: '让影响力创造价值',
  bannerCta: '去认证',
  bannerGirl: homeBannerAssets.heroTalent,
  bannerClouds: homeBannerAssets.homeBannerClouds,
}

const HOME_BANNER_SHOOT = {
  bannerTitle: '成为灵祺星选拍摄团队',
  bannerSub: '接单大厅 · 现场跟拍',
  bannerHint: '设备齐全 · 快速响应',
  bannerCta: '去认证',
  bannerGirl: homeBannerAssets.heroShoot,
  bannerClouds: homeBannerAssets.homeBannerClouds,
}

const HOME_BANNER_EDIT = {
  bannerTitle: '成为灵祺星选剪辑团队',
  bannerSub: '接单大厅 · 精剪交付',
  bannerHint: '高效出片 · 品质保障',
  bannerCta: '去认证',
  bannerGirl: homeBannerAssets.heroEdit,
  bannerClouds: homeBannerAssets.homeBannerClouds,
}

function homeBannerForIdentity(identity) {
  if (identity === 'pr') return HOME_BANNER_PR
  if (identity === 'shoot') return HOME_BANNER_SHOOT
  if (identity === 'edit') return HOME_BANNER_EDIT
  return HOME_BANNER_TALENT
}
/** 按微信胶囊位置计算顶栏留白，避免 Logo / 搜索与系统按钮遮挡 */
function matchHomeCategoryChip(row, chipId) {
  const id = String(chipId || 'all')
  if (!id || id === 'all' || id === 'more') return true
  const blob = [
    row.title,
    row.category,
    row.categoryTagsText,
    row.summary,
    row.recruitmentInfo,
    row.isIce ? '云剪' : '',
    row.urgent ? '急单' : '',
  ]
    .join(' ')
    .toLowerCase()
  const map = {
    visit: ['探店', '到店', '门店'],
    seed: ['种草', '品宣', '测评'],
    live: ['直播', '带货', '专场'],
    video: ['视频', '短视频', '成片', '云剪', '剪辑', '拍摄'],
  }
  const keys = map[id] || []
  return keys.some((k) => blob.includes(String(k).toLowerCase()))
}

function applyNavLayout(page) {
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menu = wx.getMenuButtonBoundingClientRect()
    const pxToRpx = 750 / win.windowWidth
    const menuTopRpx = Math.round(menu.top * pxToRpx)
    const capsuleRightRpx = Math.round((win.windowWidth - menu.left + 12) * pxToRpx)
    page.setData({
      navTopStyle: `padding-top:${menuTopRpx}rpx;`,
      brandPadStyle: `padding-right:${capsuleRightRpx}rpx;`,
    })
  } catch (_) {
    page.setData({
      navTopStyle: 'padding-top:calc(env(safe-area-inset-top) + 12rpx);',
      brandPadStyle: 'padding-right:200rpx;',
    })
  }
}

Page(mpPrivacyPageMixin.mergeIntoPage({
  behaviors: [require('../../behaviors/identityTheme')],
  data: {
    navTopStyle: '',
    brandPadStyle: '',
    unconfigured: false,
    loading: false,
    err: '',
    hallTab: 'normal',
    paichianSubTab: 'ice',
    searchKeyword: '',
    filterPlatform: '全部',
    filterProvince: '全部',
    filterCity: '全部',
    regionFilterLabel: '城市',
    regionMultiRange: [['全部'], ['全部']],
    regionMultiValue: [0, 0],
    priceSelected: [],
    priceFilterLabel: '价格筛选',
    showPriceSheet: false,
    sortBy: '发布时间',
    filterStatus: listFilters.HALL_DEFAULT_STATUS_FILTER || '招募中/收集中',
    statusFilters: listFilters.HALL_STATUS_FILTERS,
    workIdentity: 'talent',
    platformFilters: hallFilters.PLATFORM_FILTERS,
    cityFilters: ['全部'],
    priceBuckets: hallFilters.priceBucketsForView([]),
    sortOptions: listFilters.SORT_OPTIONS,
    todayCount: 0,
    normalRows: [],
    urgentRows: [],
    shootRows: [],
    editRows: [],
    iceRows: [],
    displayRows: [],
    tabCounts: { normal: 0, urgent: 0, shoot: 0, edit: 0, ice: 0 },
    categoryChips: HOME_CATEGORY_CHIPS,
    activeCategoryChip: 'all',
    mpBuildId: mpBuild.ID,
    shareCoverPreloadUrl: mpCdnAssets.defaultShareCover,
    showSelectionPopup: false,
    selectionPopup: null,
    showSchedulePopup: false,
    schedulePopup: null,
    showOpsBroadcastPopup: false,
    opsBroadcastPopup: null,
    showDecorPopup: false,
    decorPopup: null,
    decorBanner: null,
    ...HOME_BANNER_TALENT,
  },
  onLoad() {
    applyNavLayout(this)
    const regionState = regionFilterPicker.initRegionFilterState('全部', '全部')
    regionState.regionFilterLabel = '城市'
    this.setData(regionState)
    console.log('[mp] build', mpBuild.ID)
    void this.applyHallLocateFilter()
  },
  async applyHallLocateFilter() {
    try {
      // 真机未同意隐私时先弹门，避免 getFuzzyLocation 挂起；同时仍走 IP 兜底
      const needPrivacy = await mpPrivacyAuthorize.queryNeedAuthorization()
      if (needPrivacy && !this.data.showMpPrivacyGate) {
        this.setData({ showMpPrivacyGate: true })
      }
      const hit = await hallRegionLocate.resolveHallRegionFilter()
      if (!hit || !hit.province) return
      const regionState = regionFilterPicker.initRegionFilterState(hit.province, hit.city || '全部')
      if (regionState.filterProvince === '全部' && regionState.filterCity === '全部') {
        regionState.regionFilterLabel = '城市'
      }
      this.setData(regionState)
      this.applyFilters()
    } catch (e) {
      console.warn('[index] hall locate', e)
    }
  },
  _retryAfterPrivacyAgreed() {
    void this.applyHallLocateFilter()
  },
  onShareAppMessage() {
    mpShare.enableShareMenu()
    return mpShare.defaultShare('/pages/index/index')
  },
  onShareTimeline() {
    return mpShare.defaultTimelineShare()
  },
  onShow() {
    mpShare.enableShareMenu()
    mpShare.preloadShareCover()
    setTabBarForPage(this, '/pages/index/index')
    applyNavLayout(this)
    identityTheme.applyTabHomeChrome()
    const identity = userProfile.readIdentity()
    const identityChanged = this._lastHallIdentity !== identity
    const patch = { workIdentity: identity, ...homeBannerForIdentity(identity) }
    if (identityChanged) {
      patch.paichianSubTab = hallIdentity.defaultPaichianSubTab(identity)
      this._lastHallIdentity = identity
    }
    const hasRows = Array.isArray(this.data.displayRows) && this.data.displayRows.length > 0
    const fresh = this._lastHallLoadedAt && Date.now() - this._lastHallLoadedAt < 45000
    if (hasRows && fresh && !identityChanged) {
      this.setData(patch)
      return
    }
    this.setData({ ...patch, loading: !hasRows, err: '' })
    if (api.base()) {
      console.log('[mp] MERCHANT_API_BASE_URL=', api.base())
    }
    void loadHallList(this)
      .then(() => {
        this._lastHallLoadedAt = Date.now()
      })
      .catch((e) => {
        console.error('[index] loadHallList', e)
        this.setData({
          loading: false,
          err: '加载异常，请下拉刷新',
          displayRows: [],
        })
        this.applyFilters()
      })
      .finally(() => {
        void this.tryShowInboxPopup()
      })
  },
  async tryShowInboxPopup() {
    void this.loadDecorBanner()
    await this.tryShowSelectionPopup()
    if (!this.data.showSelectionPopup) {
      await this.tryShowSchedulePopup()
    }
    if (!this.data.showSelectionPopup && !this.data.showSchedulePopup) {
      await this.tryShowOpsBroadcastPopup()
    }
    if (
      !this.data.showSelectionPopup &&
      !this.data.showSchedulePopup &&
      !this.data.showOpsBroadcastPopup
    ) {
      await this.tryShowDecorPopup()
    }
  },
  async loadDecorBanner() {
    try {
      const identity = this.data.workIdentity || userProfile.readIdentity() || ''
      const item = await mpPlatformDecor.fetchDecorItemWithMeta('mp.home.banner', identity)
      this.setData({ decorBanner: item && item.imageUrl ? item : null })
    } catch (_) {
      this.setData({ decorBanner: null })
    }
  },
  onDecorBannerTap() {
    const item = this.data.decorBanner
    if (item) mpPlatformDecor.openDecorLink(item)
  },
  async tryShowDecorPopup() {
    if (
      this._decorPopupLoading ||
      this.data.showDecorPopup ||
      this.data.showSelectionPopup ||
      this.data.showSchedulePopup ||
      this.data.showOpsBroadcastPopup ||
      this.data.showPriceSheet
    ) {
      return
    }
    this._decorPopupLoading = true
    try {
      const identity = this.data.workIdentity || userProfile.readIdentity() || ''
      const item = await mpPlatformDecor.fetchDecorItemWithMeta('mp.home.popup', identity)
      if (
        !item ||
        !item.imageUrl ||
        !mpPlatformDecor.shouldShowByFreq(item) ||
        this.data.showSelectionPopup ||
        this.data.showSchedulePopup ||
        this.data.showOpsBroadcastPopup
      ) {
        return
      }
      this.setData({ showDecorPopup: true, decorPopup: item })
    } catch (e) {
      console.warn('[index] decor popup', e)
    } finally {
      this._decorPopupLoading = false
    }
  },
  onDecorPopupDismiss() {
    const item = this.data.decorPopup
    if (item) mpPlatformDecor.dismissItem(item)
    this.setData({ showDecorPopup: false, decorPopup: null })
  },
  onDecorPopupTap() {
    const item = this.data.decorPopup
    if (item) {
      mpPlatformDecor.dismissItem(item)
      mpPlatformDecor.openDecorLink(item)
    }
    this.setData({ showDecorPopup: false, decorPopup: null })
  },
  async tryShowSelectionPopup() {
    if (this._selectionPopupLoading || this.data.showSelectionPopup || this.data.showPriceSheet) return
    this._selectionPopupLoading = true
    try {
      if (auth.isLoggedIn()) {
        try {
          await require('../../utils/mpAccountClientSync.js').ensureClientStatePulled()
        } catch (_) {}
      }
      const row = await selectionHomePopup.loadPendingSelectionNotice()
      if (!row || this.data.showSelectionPopup || this.data.showPriceSheet) return
      const payload = selectionHomePopup.toPopupPayload(row)
      if (!payload) return
      this.setData({ showSelectionPopup: true, selectionPopup: payload })
    } catch (e) {
      console.warn('[index] selection popup', e)
    } finally {
      this._selectionPopupLoading = false
    }
  },
  onSelectionPopupDismiss() {
    const row = this.data.selectionPopup
    if (row) selectionHomePopup.dismissSelectionNotice(row)
    this.setData({ showSelectionPopup: false, selectionPopup: null })
    void this.tryShowSchedulePopup()
  },
  async tryShowSchedulePopup() {
    if (this._schedulePopupLoading || this.data.showSchedulePopup || this.data.showSelectionPopup || this.data.showPriceSheet) return false
    this._schedulePopupLoading = true
    try {
      if (auth.isLoggedIn()) {
        try {
          await require('../../utils/mpAccountClientSync.js').ensureClientStatePulled()
        } catch (_) {}
      }
      const row = await scheduleHomePopup.loadPendingScheduleNotice()
      if (!row || this.data.showSchedulePopup || this.data.showSelectionPopup || this.data.showPriceSheet) return false
      const payload = scheduleHomePopup.toPopupPayload(row)
      if (!payload) return false
      this.setData({ showSchedulePopup: true, schedulePopup: payload })
      return true
    } catch (e) {
      console.warn('[index] schedule popup', e)
      return false
    } finally {
      this._schedulePopupLoading = false
    }
  },
  onSchedulePopupDismiss() {
    const row = this.data.schedulePopup
    if (row) scheduleHomePopup.dismissScheduleNotice(row)
    this.setData({ showSchedulePopup: false, schedulePopup: null })
    void (async () => {
      const shown = await this.tryShowSchedulePopup()
      if (!shown) await this.tryShowOpsBroadcastPopup()
    })()
  },
  async tryShowOpsBroadcastPopup() {
    if (
      this._opsBroadcastPopupLoading ||
      this.data.showOpsBroadcastPopup ||
      this.data.showSelectionPopup ||
      this.data.showSchedulePopup ||
      this.data.showPriceSheet
    ) {
      return
    }
    this._opsBroadcastPopupLoading = true
    try {
      if (auth.isLoggedIn()) {
        try {
          await require('../../utils/mpAccountClientSync.js').ensureClientStatePulled()
        } catch (_) {}
      }
      const row = await opsBroadcastHomePopup.loadPendingOpsBroadcastNotice()
      if (
        !row ||
        this.data.showOpsBroadcastPopup ||
        this.data.showSelectionPopup ||
        this.data.showSchedulePopup ||
        this.data.showPriceSheet
      ) {
        return
      }
      const payload = opsBroadcastHomePopup.toPopupPayload(row)
      if (!payload) return
      this.setData({ showOpsBroadcastPopup: true, opsBroadcastPopup: payload })
    } catch (e) {
      console.warn('[index] ops broadcast popup', e)
    } finally {
      this._opsBroadcastPopupLoading = false
    }
  },
  onOpsBroadcastPopupDismiss() {
    const row = this.data.opsBroadcastPopup
    if (row) opsBroadcastHomePopup.dismissOpsBroadcastNotice(row)
    this.setData({ showOpsBroadcastPopup: false, opsBroadcastPopup: null })
    void this.tryShowDecorPopup()
  },
  onPreviewSelectionQr() {
    const url = this.data.selectionPopup && this.data.selectionPopup.imageUrl
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  onPullDownRefresh() {
    loadHallList(this)
      .catch(() => {})
      .finally(() => {
        wx.stopPullDownRefresh()
        void this.tryShowInboxPopup()
      })
  },
  applyFilters() {
    const tab = this.data.hallTab
    let rows = this.data.normalRows
    if (tab === 'urgent') rows = this.data.urgentRows
    else if (tab === 'paichian') {
      const sub = this.data.paichianSubTab
      if (sub === 'edit') rows = this.data.editRows
      else if (sub === 'ice') rows = this.data.iceRows
      else rows = this.data.shootRows
    }
    if (!showDemoOrders()) {
      rows = rows.filter((r) => r && !r.isMock)
    }
    const kw = String(this.data.searchKeyword || '').trim()
    const pf = this.data.filterPlatform
    const provf = this.data.filterProvince
    const cf = this.data.filterCity
    const priceSel = this.data.priceSelected
    const statusF = this.data.filterStatus
    rows = rows.filter((r) => {
      if (!listKeywordSearch.matchListKeyword(r, kw)) return false
      if (!hallFilters.matchPlatform(r.platform, pf)) return false
      if (!hallFilters.matchRegionFilter(r.region, r.storeName, provf, cf)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSel)) return false
      if (!listFilters.matchHallStatus(r, statusF)) return false
      if (!matchHomeCategoryChip(r, this.data.activeCategoryChip)) return false
      return true
    })
    rows = listFilters.sortHallRecruitmentRows(rows, this.data.sortBy)
    const countForTab = (list) =>
      (list || []).filter((r) => {
        if (!showDemoOrders() && r && r.isMock) return false
        if (!listKeywordSearch.matchListKeyword(r, kw)) return false
        if (!hallFilters.matchPlatform(r.platform, pf)) return false
        if (!hallFilters.matchRegionFilter(r.region, r.storeName, provf, cf)) return false
        if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSel)) return false
        if (!listFilters.matchHallTabCountStatus(r, statusF)) return false
        return true
      }).length
    const tabCounts = {
      normal: countForTab(this.data.normalRows),
      urgent: countForTab(this.data.urgentRows),
      shoot: countForTab(this.data.shootRows),
      edit: countForTab(this.data.editRows),
      ice: countForTab(this.data.iceRows),
    }
    const withTags = (list) =>
      list.map((r) => {
        const tagged =
          recruitmentAi.resolveRowHallTag(r) ||
          { ...r, aiTag: '', aiTagTone: 'default', aiTagBg: '', aiTagFg: '', aiTagSource: 'pending' }
        const row = listFilters.attachHallCardHighlightTags({
          ...tagged,
          cardPriceLine: budgetDisplayUtil.formatCardPriceLine(tagged),
        })
        return row
      })
    const baseRows = withTags(rows)
    const token = Date.now()
    this._aiTagToken = token
    this.setData({ displayRows: baseRows, tabCounts })
    recruitmentAi.enrichOrderTags(baseRows, {}).then(async (enriched) => {
      if (this._aiTagToken !== token || this.data.hallTab !== tab) return
      let final = withTags(enriched)
      const member = memberStore.readMember()
      const identity = this.data.workIdentity || userProfile.readIdentity()
      if (member && identity === 'talent' && enriched.some((r) => r && !r.isMock)) {
        try {
          const real = enriched.filter((r) => r && !r.isMock)
          const mocks = enriched.filter((r) => r && r.isMock)
          const matched = await recruitmentAi.enrichOrderMatches(real, member, { workIdentity: identity })
          const byId = {}
          for (const r of matched) byId[r.id] = r
          final = withTags(enriched.map((r) => (r && byId[r.id] ? { ...r, ...byId[r.id] } : r)))
          if (mocks.length) final = [...final.filter((r) => !r.isMock), ...mocks]
        } catch (_) {}
      }
      this.setData({ displayRows: final })
    })
  },
  onCategoryChip(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ activeCategoryChip: id })
    this.applyFilters()
  },
  goVerifyTalent() {
    const url = '/pages/register/register?edit=1'
    if (!auth.isLoggedIn()) {
      require('../../utils/mpGuestRoutes.js').redirectToLogin(url)
      return
    }
    wx.navigateTo({ url })
  },
  onSearchConfirm() {
    this.applyFilters()
  },
  applyHallTab(tab) {
    this.setData({ hallTab: tab })
    this.applyFilters()
  },
  onHallTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === 'urgent' || tab === 'normal' || tab === 'paichian') this.applyHallTab(tab)
  },
  onPaichianSubTab(e) {
    const sub = e.currentTarget.dataset.sub
    if (sub === 'shoot' || sub === 'edit' || sub === 'ice') {
      this.setData({ paichianSubTab: sub })
      this.applyFilters()
    }
  },
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
    this.applyFilters()
  },
  onPlatformFilter(e) {
    this.setData({ filterPlatform: this.data.platformFilters[Number(e.detail.value)] || '全部' })
    this.applyFilters()
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
    if (next.filterProvince === '全部' && next.filterCity === '全部') {
      next.regionFilterLabel = '城市'
      hallRegionLocate.clearStoredFilter()
    } else {
      hallRegionLocate.writeStoredFilter(next.filterProvince, next.filterCity)
    }
    this.setData(next)
    this.applyFilters()
  },
  onOpenPriceSheet() {
    this.setData({
      showPriceSheet: true,
      priceBuckets: hallFilters.priceBucketsForView(this.data.priceSelected),
    })
  },
  onClosePriceSheet() {
    this.setData({ showPriceSheet: false })
  },
  noopSheetTap() {},
  onTogglePrice(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const next = hallFilters.togglePriceId(this.data.priceSelected, id)
    this.setData({
      priceSelected: next,
      priceBuckets: hallFilters.priceBucketsForView(next),
    })
  },
  onResetPrice() {
    this.setData({
      priceSelected: [],
      priceBuckets: hallFilters.priceBucketsForView([]),
    })
  },
  onConfirmPrice() {
    const priceSelected = this.data.priceSelected || []
    this.setData({
      showPriceSheet: false,
      priceFilterLabel: hallFilters.priceFilterLabel(priceSelected),
    })
    this.applyFilters()
  },
  onSortFilter(e) {
    this.setData({ sortBy: this.data.sortOptions[Number(e.detail.value)] || '发布时间' })
    this.applyFilters()
  },
  onStatusFilter(e) {
    this.setData({
      filterStatus: this.data.statusFilters[Number(e.detail.value)] || '全部',
    })
    this.applyFilters()
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    const isMock = e.currentTarget.dataset.mock
    if (!id) return
    if (isMock) {
      wx.showToast({ title: '演示商单，仅供预览', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(id)}` })
  },
}))
