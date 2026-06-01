const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
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
  },
  onLoad() {
    applyNavLayout(this)
  },
  onShow() {
    setTabBarForPage(this, '/pages/index/index')
    applyNavLayout(this)
    if (merchant.baseUrl()) {
      console.log('[mp] MERCHANT_API_BASE_URL=', merchant.baseUrl())
    }
    this.loadList()
  },
  async loadList() {
    if (!merchant.hasMerchantApi()) {
      const mockOnly = [listFilters.buildMockRecruitmentRow()]
      this.setData({
        unconfigured: true,
        loading: false,
        normalRows: mockOnly,
        urgentRows: [],
        iceRows: [],
        todayCount: 0,
        cityFilters: hallFilters.buildCityFilterOptions(mockOnly),
      })
      this.applyFilters()
      return
    }
    this.setData({ loading: true, err: '', unconfigured: false })
    const apiBase = merchant.baseUrl()
    try {
      const reg = await ops.fetchRegistry()
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const openList = mpList.filter((o) => o && (o.status === 'open' || o.status === 'collecting'))
      const mapped = openList.map((mp) => orderCard.mapMpOrderRow(mp, reg))
      const iceRows = mapped.filter((r) => r.isIce)
      const urgentRows = mapped.filter((r) => r.urgent && !r.isIce)
      const realNormal = mapped.filter((r) => !r.urgent && !r.isIce)
      const normalRows =
        realNormal.length > 0 ? realNormal : [listFilters.buildMockRecruitmentRow()]
      const allForCity = [...normalRows, ...urgentRows, ...iceRows]
      this.setData({
        normalRows,
        urgentRows,
        iceRows,
        cityFilters: hallFilters.buildCityFilterOptions(allForCity),
        todayCount: openList.length,
        loading: false,
      })
      this.applyFilters()
    } catch (e) {
      const msg = String(e.message || e)
      const registryUrl = merchant.resolveMerchantApiUrl('/api/meoo-ops-sync-registry')
      let hint = msg
      if (/url not in domain list|不在.*合法域名|domain list/i.test(msg)) {
        hint =
          '微信未放行该域名。request 合法域名请填：https://mofangdianai.com（与控制台要求一致，末尾勿加分号）。保存后等 10 分钟并删除小程序再扫体验版。\n\n' +
          msg
      } else if (/timeout|超时/i.test(msg)) {
        hint = '请求超时（注册表较大或网络慢）。\n\n' + msg
      } else if (/ssl|certificate|证书/i.test(msg)) {
        hint = 'HTTPS 证书校验失败，请确认域名证书有效。\n\n' + msg
      } else if (/reset|errcode:-101|cronet_error/i.test(msg)) {
        const hallUrl = merchant.resolveMerchantApiUrl('/api/meoo-ops-mp-hall-registry')
        hint =
          '浏览器能开、微信仍 reset：请在 ECS 执行\n' +
          'sudo bash ~/app/scripts/ecs-fix-wechat-cronet-tls.sh\n' +
          'cd ~/app && git pull && bash scripts/ecs-fix-erp-api-502.sh\n' +
          '然后上传新体验版。大厅优先拉轻量接口：\n' +
          (hallUrl || '') +
          '\n\n' +
          msg
      }
      if (apiBase && !hint.includes(apiBase)) {
        hint += `\n\nAPI 根地址：${apiBase}`
      }
      if (registryUrl && !hint.includes(registryUrl)) {
        hint += `\n注册表：${registryUrl}`
      }
      this.setData({
        loading: false,
        err: hint,
        normalRows: [],
        urgentRows: [],
        iceRows: [],
        displayRows: [],
      })
    }
  },
  applyFilters() {
    const tab = this.data.hallTab
    let rows =
      tab === 'urgent' ? this.data.urgentRows : tab === 'ice' ? this.data.iceRows : this.data.normalRows
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
