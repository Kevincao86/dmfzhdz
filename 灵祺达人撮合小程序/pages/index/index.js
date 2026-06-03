const api = require('../../utils/api.js')
const { showDemoOrders } = require('../../utils/mpDemoMode.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const mpBuild = require('../../utils/mpBuild.js')
const listFilters = require('../../utils/recruitmentListFilters.js')
const hallFilters = require('../../utils/recruitmentHallFilters.js')
const orderCard = require('../../utils/recruitmentOrderCard.js')
const recruitmentAi = require('../../utils/recruitmentAiTags.js')
const { setTabBarForPage } = require('../../utils/tabBar.js')

function matchSearch(row, keyword) {
  if (!keyword) return true
  const k = keyword.toLowerCase()
  const blob = [row.title, row.merchantName, row.storeName, row.region, row.category]
    .join(' ')
    .toLowerCase()
  return blob.includes(k)
}

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
    loading: true,
    err: '',
    hallTab: 'normal',
    searchKeyword: '',
    filterPlatform: '全部',
    filterCity: '全部',
    priceSelected: [],
    priceFilterLabel: '价格筛选',
    showPriceSheet: false,
    sortBy: '发布时间',
    platformFilters: hallFilters.PLATFORM_FILTERS,
    cityFilters: ['全部'],
    priceBuckets: hallFilters.priceBucketsForView([]),
    sortOptions: listFilters.SORT_OPTIONS,
    todayCount: 0,
    normalRows: [],
    urgentRows: [],
    iceRows: [],
    displayRows: [],
    mpBuildId: mpBuild.ID,
  },
  onLoad() {
    applyNavLayout(this)
    console.log('[mp] build', mpBuild.ID)
  },
  onShow() {
    setTabBarForPage(this, '/pages/index/index')
    applyNavLayout(this)
    if (api.base()) {
      console.log('[mp] MERCHANT_API_BASE_URL=', api.base())
    }
    this.loadList()
  },
  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },
  applyRegistryRows(reg, banner) {
    const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
    const openList = mpList.filter((o) => o && (o.status === 'open' || o.status === 'collecting'))
    const mapped = openList.map((mp) => orderCard.mapMpOrderRow(mp, reg))
    const iceRows = mapped.filter((r) => r.isIce)
    const urgentRows = mapped.filter((r) => r.urgent && !r.isIce)
    const hallNonIce = mapped.filter((r) => !r.isIce)
    const normalRows = listFilters.mergeHallDisplayRows(hallNonIce, {
      allowDemo: showDemoOrders(),
    })
    const allForCity = [...mapped]
    this.setData({
      normalRows,
      urgentRows,
      iceRows,
      cityFilters: hallFilters.buildCityFilterOptions(allForCity),
      todayCount: openList.length,
      loading: false,
      err: '',
    })
    this.applyFilters()
  },

  async loadList() {
    const loadTok = (this._loadSeq = (this._loadSeq || 0) + 1)
    if (!api.hasApi()) {
      const demo = showDemoOrders() ? listFilters.mergeHallDisplayRows([], { allowDemo: true }) : []
      this.setData({
        unconfigured: true,
        loading: false,
        normalRows: demo,
        urgentRows: [],
        iceRows: [],
        todayCount: 0,
        cityFilters: hallFilters.buildCityFilterOptions(demo),
        err: demo.length ? '' : '未连接后台',
      })
      this.applyFilters()
      return
    }
    this.setData({ unconfigured: false, loading: true, err: '' })
    let showedOffline = false
    const offline = registryCache.load({ allowStale: true })
    const offlineMp = offline && offline.data && offline.data.mpRecruitmentOrders
    if (offline && offline.data && Array.isArray(offlineMp) && offlineMp.length > 0) {
      showedOffline = true
      this.applyRegistryRows(offline.data, '')
    }
    const watchdog = setTimeout(() => {
      if (this._loadSeq !== loadTok) return
      if (!this.data.loading) return
      this.setData({
        loading: false,
        err: '加载超时，请下拉刷新',
        normalRows: [],
        urgentRows: [],
        iceRows: [],
        displayRows: [],
      })
      this.applyFilters()
    }, 18000)
    let cacheWarn = ''
    try {
      let reg
      try {
        reg = await ops.fetchRegistry()
      } catch (e) {
        if (e && e.fromCache && e.cachedData) {
          reg = e.cachedData
          cacheWarn = String(e.message || '已使用本地缓存')
        } else {
          throw e
        }
      }
      if (this._loadSeq !== loadTok) return
      this.applyRegistryRows(reg, cacheWarn)
    } catch (e) {
      if (this._loadSeq !== loadTok) return
      if (showedOffline) {
        this.setData({ loading: false, err: '刷新失败，请下拉重试' })
        return
      }
      const msg = String(e.message || e)
      let hint = '加载失败，请稍后重试'
      if (/timeout|超时/i.test(msg)) {
        hint = '加载超时，请检查网络后重试'
      } else if (/url not in domain list|不在.*合法域名|domain list/i.test(msg)) {
        hint = '网络配置异常，请联系管理员'
      } else if (/reset|errcode:-101|cronet/i.test(msg)) {
        const stale = registryCache.load({ allowStale: true })
        if (stale && stale.data) {
          this.applyRegistryRows(stale.data, '')
          this.setData({ err: '网络不稳定，已显示缓存列表' })
          return
        }
        hint = '网络不稳定，请删除小程序后重新扫码'
      }
      this.setData({
        loading: false,
        err: hint,
        normalRows: [],
        urgentRows: [],
        iceRows: [],
        displayRows: [],
      })
      this.applyFilters()
    } finally {
      clearTimeout(watchdog)
      if (this._loadSeq === loadTok && this.data.loading) {
        this.setData({ loading: false })
      }
    }
  },
  applyFilters() {
    const tab = this.data.hallTab
    let rows =
      tab === 'urgent' ? this.data.urgentRows : tab === 'ice' ? this.data.iceRows : this.data.normalRows
    if (!showDemoOrders()) {
      rows = rows.filter((r) => r && !r.isMock)
    }
    const kw = String(this.data.searchKeyword || '').trim()
    const pf = this.data.filterPlatform
    const cf = this.data.filterCity
    const priceSel = this.data.priceSelected
    rows = rows.filter((r) => {
      if (!matchSearch(r, kw)) return false
      if (!hallFilters.matchPlatform(r.platform, pf)) return false
      if (!hallFilters.matchCity(r.region, r.storeName, cf)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSel)) return false
      return true
    })
    rows = listFilters.sortRecruitmentRows(rows, this.data.sortBy)
    const baseRows = rows.map((r) => ({
      ...r,
      ...recruitmentAi.fallbackTagForRow(r),
      aiTagSource: 'local',
    }))
    const token = Date.now()
    this._aiTagToken = token
    this.setData({ displayRows: baseRows })
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
    if (tab === 'urgent' || tab === 'normal' || tab === 'ice') this.applyHallTab(tab)
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
