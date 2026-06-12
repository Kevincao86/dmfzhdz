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
const { setTabBarForPage } = require('../../utils/tabBar.js')
const mpShare = require('../../utils/mpShare.js')
const listKeywordSearch = require('../../utils/listKeywordSearch.js')
const selectionHomePopup = require('../../utils/selectionHomePopup.js')
/** 按微信胶囊位置计算顶栏留白，避免 Logo / 搜索与系统按钮遮挡 */
function applyNavLayout(page) {
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menu = wx.getMenuButtonBoundingClientRect()
    const pxToRpx = 750 / win.windowWidth
    const menuTopRpx = Math.round(menu.top * pxToRpx)
    const menuHeightRpx = Math.round(menu.height * pxToRpx)
    const capsuleRightRpx = Math.round((win.windowWidth - menu.left + 12) * pxToRpx)
    const logoSizeRpx = Math.round(menuHeightRpx * 1.92)
    page.setData({
      navInnerStyle: `padding-top:${menuTopRpx}rpx;padding-right:${capsuleRightRpx}rpx;`,
      brandRowStyle: `min-height:${logoSizeRpx}rpx;`,
      brandLogoStyle: `width:${logoSizeRpx}rpx;height:${logoSizeRpx}rpx;`,
    })
  } catch (_) {
    page.setData({
      navInnerStyle: 'padding-top:calc(env(safe-area-inset-top) + 12rpx);padding-right:200rpx;',
      brandRowStyle: 'min-height:136rpx;',
      brandLogoStyle: 'width:136rpx;height:136rpx;',
    })
  }
}

Page({
  data: {
    navInnerStyle: '',
    brandRowStyle: '',
    brandLogoStyle: '',
    unconfigured: false,
    loading: false,
    err: '',
    hallTab: 'normal',
    paichianSubTab: 'ice',
    searchKeyword: '',
    filterPlatform: '全部',
    filterCity: '全部',
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
    mpBuildId: mpBuild.ID,
    showSelectionPopup: false,
    selectionPopup: null,
  },
  onLoad() {
    applyNavLayout(this)
    console.log('[mp] build', mpBuild.ID)
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
    const identity = userProfile.readIdentity()
    const patch = { workIdentity: identity }
    if (this._lastHallIdentity !== identity) {
      patch.paichianSubTab = hallIdentity.defaultPaichianSubTab(identity)
      this._lastHallIdentity = identity
    }
    this.setData(patch)
    if (api.base()) {
      console.log('[mp] MERCHANT_API_BASE_URL=', api.base())
    }
    void loadHallList(this)
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
        void this.tryShowSelectionPopup()
      })
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
    void this.tryShowSelectionPopup()
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
        void this.tryShowSelectionPopup()
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
    const cf = this.data.filterCity
    const priceSel = this.data.priceSelected
    const statusF = this.data.filterStatus
    rows = rows.filter((r) => {
      if (!listKeywordSearch.matchListKeyword(r, kw)) return false
      if (!hallFilters.matchPlatform(r.platform, pf)) return false
      if (!hallFilters.matchCity(r.region, r.storeName, cf)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSel)) return false
      if (!listFilters.matchHallStatus(r, statusF)) return false
      return true
    })
    rows = listFilters.sortHallRecruitmentRows(rows, this.data.sortBy)
    const countForTab = (list) =>
      (list || []).filter((r) => {
        if (!showDemoOrders() && r && r.isMock) return false
        if (!listKeywordSearch.matchListKeyword(r, kw)) return false
        if (!hallFilters.matchPlatform(r.platform, pf)) return false
        if (!hallFilters.matchCity(r.region, r.storeName, cf)) return false
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
    const orderHighlightTag = require('../../utils/orderHighlightTag.js')
    const baseRows = rows.map((r) =>
      r.aiTagSource === 'persisted' && r.aiTag
        ? orderHighlightTag.attachRowTagStyle(r)
        : { ...r, aiTag: '', aiTagTone: 'default', aiTagBg: '', aiTagFg: '', aiTagSource: 'pending' },
    )
    const token = Date.now()
    this._aiTagToken = token
    this.setData({ displayRows: baseRows, tabCounts })
    recruitmentAi.enrichOrderTags(baseRows, {}).then((enriched) => {
      if (this._aiTagToken !== token || this.data.hallTab !== tab) return
      this.setData({ displayRows: enriched })
    })
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
  onCityFilter(e) {
    this.setData({ filterCity: this.data.cityFilters[Number(e.detail.value)] || '全部' })
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
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
})
