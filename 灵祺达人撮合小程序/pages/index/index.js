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
const mpTraining = require('../../utils/mpTraining.js')
const memberStore = require('../../utils/talentMember.js')
const regionFilterPicker = require('../../utils/regionFilterPicker.js')
const hallRegionLocate = require('../../utils/hallRegionLocate.js')
const budgetDisplayUtil = require('../../utils/recruitmentBudgetDisplay.js')
const mpPrivacyPageMixin = require('../../utils/mpPrivacyPageMixin.js')
const mpPrivacyAuthorize = require('../../utils/mpPrivacyAuthorize.js')

/** 定位结果放在页面实例上。列表 setData 若用尚未刷上的 data 当底，会把 filterCity 冲回「全部」。 */
function rememberHallRegion(page, province, city) {
  page._hallRegion = {
    province: String(province || '全部'),
    city: String(city || '全部'),
  }
  page._hallRegionSeq = (page._hallRegionSeq || 0) + 1
  return page._hallRegionSeq
}

function reapplyHallRegionSoon(page, seq) {
  setTimeout(() => {
    if (!page || page._hallRegionSeq !== seq) return
    if (typeof page.applyFilters === 'function') page.applyFilters()
  }, 0)
}

/** 已选城市时：region 写明了别的市，不能因为门店名里带定位城市就放行 */
function regionNamesOtherCity(region, cityFilter) {
  const c = String(cityFilter || '').trim()
  if (!c || c === '全部' || c === '全部城市') return false
  const short = c.replace(/市$/, '')
  const named = []
  const re = /([\u4e00-\u9fa5]{2,8})市/g
  const text = String(region || '')
  let m
  while ((m = re.exec(text))) {
    const raw = m[1].includes('省') ? m[1].split('省').pop() : m[1]
    if (raw && raw.length >= 2) named.push(`${raw}市`)
  }
  if (!named.length) return false
  return !named.some((name) => name === c || name.replace(/市$/, '') === short)
}

const HOME_CATEGORY_CHIPS = [
  { id: 'all', label: '全部' },
  { id: 'visit', label: '探店' },
  { id: 'seed', label: '种草' },
  { id: 'live', label: '直播' },
  { id: 'video', label: '视频' },
  { id: 'more', label: '更多' },
]

const mpCdnAssets = require('../../utils/mpCdnAssets.js')
const homeBannerAssets = require('../../utils/homeBannerAssets.js')
const recruitCoverOssBase = require('../../utils/recruitCoverOssBase.js')

function homeEntryUrl(name) {
  const base = String(recruitCoverOssBase || '').replace(/\/$/, '')
  return `${base}/home/${name}?v=20261003c`
}

function homeEntriesForIdentity(identity) {
  const posterTalent = homeBannerAssets.posterDefault
  if (identity === 'pr') {
    return {
      entryLeftKey: 'publish',
      entryLeftUrl: homeEntryUrl('entry-publish.jpg'),
      entryRightKey: 'apps',
      entryRightUrl: homeEntryUrl('entry-orders.jpg'),
      posterPresetUrl: homeEntryUrl('poster-pr.jpg'),
    }
  }
  if (identity === 'shoot' || identity === 'edit') {
    return {
      entryLeftKey: 'course',
      entryLeftUrl: homeEntryUrl('entry-course.jpg'),
      entryRightKey: 'apps',
      entryRightUrl: homeEntryUrl('entry-apply.jpg'),
      posterPresetUrl: posterTalent,
    }
  }
  return {
    entryLeftKey: 'eval',
    entryLeftUrl: homeEntryUrl('entry-eval.jpg'),
    entryRightKey: 'apps',
    entryRightUrl: homeEntryUrl('entry-apply.jpg'),
    posterPresetUrl: posterTalent,
  }
}

const HOME_BANNER_PR = {
  bannerTitle: '灵祺星选 PR 工作台',
  bannerSub: '发布招募，对接认证达人',
  bannerHint: '企业级撮合与履约协同',
  bannerCta: '立即认证',
}

const HOME_BANNER_TALENT = {
  bannerTitle: '灵祺星选达人工作台',
  bannerSub: '承接品牌商单与探店合作',
  bannerHint: '认证后参与平台撮合',
  bannerCta: '立即认证',
}

const HOME_BANNER_SHOOT = {
  bannerTitle: '灵祺星选拍摄工作台',
  bannerSub: '现场跟拍与设备交付',
  bannerHint: '认证团队优先派单',
  bannerCta: '立即认证',
}

const HOME_BANNER_EDIT = {
  bannerTitle: '灵祺星选剪辑工作台',
  bannerSub: '成片交付与档期管理',
  bannerHint: '认证团队优先派单',
  bannerCta: '立即认证',
}

function homeBannerForIdentity(identity) {
  if (identity === 'pr') return HOME_BANNER_PR
  if (identity === 'shoot') return HOME_BANNER_SHOOT
  if (identity === 'edit') return HOME_BANNER_EDIT
  return HOME_BANNER_TALENT
}

function buildHomeGreeting() {
  const h = new Date().getHours()
  let hello = '你好'
  if (h < 5) hello = '夜深了'
  else if (h < 11) hello = '上午好'
  else if (h < 14) hello = '中午好'
  else if (h < 18) hello = '下午好'
  else hello = '晚上好'
  let name = '达人'
  try {
    const acct = auth.readAccount()
    const nick = acct && (acct.wxNickName || acct.nickName || acct.nickname)
    const s = String(nick || '').trim()
    if (s && s !== '微信用户' && s !== '用户' && s !== '灵祺用户') name = s.slice(0, 12)
  } catch (_) {}
  return `${hello}，${name}`
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
    const navTopStyle = `padding-top:${menuTopRpx}rpx;`
    const brandPadStyle = `padding-right:${capsuleRightRpx}rpx;`
    if (page.data.navTopStyle === navTopStyle && page.data.brandPadStyle === brandPadStyle) return
    page.setData({ navTopStyle, brandPadStyle })
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
    showPaichianTab: false,
    showShootSub: false,
    showEditSub: false,
    showIceSub: false,
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
    homeSlides: [],
    homeGreeting: '下午好，达人',
    homePosterInterval: 4000,
    ...homeEntriesForIdentity('talent'),
    kpiRecruitIcon: homeBannerAssets.kpiRecruit,
    kpiUrgentIcon: homeBannerAssets.kpiUrgent,
    kpiTodayIcon: homeBannerAssets.kpiToday,
    trainAds: [],
    ...HOME_BANNER_TALENT,
  },
  onLoad() {
    applyNavLayout(this)
    const stored = hallRegionLocate.readStoredFilter()
    const regionState = regionFilterPicker.initRegionFilterState(
      stored && stored.province ? stored.province : '全部',
      stored && stored.city ? stored.city : '全部',
    )
    if (regionState.filterProvince === '全部' && regionState.filterCity === '全部') {
      regionState.regionFilterLabel = '城市'
    } else {
      rememberHallRegion(this, regionState.filterProvince, regionState.filterCity)
    }
    Object.assign(this.data, regionState)
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
      // 本会话用户已手动选城：勿用异步 GPS/IP 回写覆盖
      if (this._hallRegionUserPicked || this._regionPickerBusy) return
      let hit = await hallRegionLocate.resolveHallRegionFilter()
      // 定位等待期间用户可能已写入本地偏好，二次读取避免竞态覆盖
      const stored = hallRegionLocate.readStoredFilter()
      if (stored && (stored.province !== '全部' || (stored.city && stored.city !== '全部'))) {
        hit = stored
      }
      if (this._hallRegionUserPicked || this._regionPickerBusy) return
      if (!hit || !hit.province) return
      const regionState = regionFilterPicker.initRegionFilterState(hit.province, hit.city || '全部')
      if (regionState.filterProvince === '全部' && regionState.filterCity === '全部') {
        regionState.regionFilterLabel = '城市'
      }
      const seq = rememberHallRegion(this, regionState.filterProvince, regionState.filterCity)
      Object.assign(this.data, regionState)
      this.setData(regionState)
      this.applyFilters()
      reapplyHallRegionSoon(this, seq)
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
    setTabBarForPage(this, '/pages/index/index')
    applyNavLayout(this)
    identityTheme.applyTabHomeChrome()
    const identity = userProfile.readIdentity()
    const identityChanged = this._lastHallIdentity !== identity
    const tabVis = hallIdentity.hallTabVisibility(identity)
    const patch = {
      workIdentity: identity,
      homeGreeting: buildHomeGreeting(),
      ...tabVis,
      ...homeBannerForIdentity(identity),
      ...homeEntriesForIdentity(identity),
    }
    if (!tabVis.showPaichianTab && this.data.hallTab === 'paichian') patch.hallTab = 'normal'
    if (identityChanged) {
      patch.paichianSubTab = hallIdentity.defaultPaichianSubTab(identity)
      this._lastHallIdentity = identity
    }
    const hasRows = Array.isArray(this.data.displayRows) && this.data.displayRows.length > 0
    const afterHall = () => {
      if (this._hallRegion) this.applyFilters()
    }
    if (hasRows && !identityChanged) {
      this.setData(patch)
      void loadHallList(this).then(afterHall)
      return
    }
    this.setData({ ...patch, loading: !hasRows, err: '' })
    if (api.base()) {
      console.log('[mp] MERCHANT_API_BASE_URL=', api.base())
    }
    void loadHallList(this)
      .then(() => {
        this._lastHallLoadedAt = Date.now()
        afterHall()
      })
      .catch((e) => {
        console.error('[index] loadHallList', e)
        this.setData({
          loading: false,
          err: '加载异常，请下拉刷新',
          displayRows: hasRows ? this.data.displayRows : [],
        })
        this.applyFilters()
      })
    if (!this._inboxPopupShown) {
      this._inboxPopupShown = true
      void this.tryShowInboxPopup()
    }
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
    const identity = this.data.workIdentity || userProfile.readIdentity() || ''
    let decor = []
    try {
      decor = await mpPlatformDecor.fetchDecorItems('mp.home.banner', identity)
    } catch (_) {
      decor = []
    }
    let trainAds = []
    try {
      const courses = await mpTraining.listCourses()
      trainAds = (Array.isArray(courses) ? courses : [])
        .filter((c) => c && String(c.posterMp || '').indexOf('data:image/') === 0)
        .slice(0, 6)
        .map((c) => ({ id: c.id, title: c.title || '培训课程', poster: c.posterMp }))
    } catch (_) {
      trainAds = []
    }
    const slides = []
    const carouselSec = Number(decor[0] && decor[0].carouselSeconds)
    const homePosterInterval =
      carouselSec >= 2 && carouselSec <= 30 ? Math.round(carouselSec * 1000) : 4000
    decor.forEach((item, i) => {
      if (!item || !item.imageUrl) return
      slides.push({
        key: `decor-${item.id || i}`,
        kind: 'decor',
        imageUrl: item.imageUrl,
        isVideo: !!item.isVideo,
        title: '',
        linkType: item.linkType,
        linkValue: item.linkValue,
      })
    })
    trainAds.forEach((item) => {
      slides.push({
        key: `train-${item.id}`,
        kind: 'train',
        id: item.id,
        imageUrl: item.poster,
        isVideo: false,
        title: item.title || '',
      })
    })
    this.setData({
      homeSlides: slides,
      homePosterInterval,
      trainAds,
      decorBanner: decor[0] || null,
    })
  },
  onHomeSlideTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = (this.data.homeSlides || [])[index]
    if (!item) return
    if (item.kind === 'train') {
      const url = item.id
        ? `/pages/subpack-mine/mine-training-detail/mine-training-detail?id=${item.id}`
        : '/pages/subpack-mine/mine-training/mine-training'
      wx.navigateTo({ url })
      return
    }
    mpPlatformDecor.openDecorLink(item)
  },
  onFallbackPosterTap() {
    if ((this.data.workIdentity || userProfile.readIdentity()) === 'pr') {
      wx.switchTab({ url: '/pages/publish/publish' })
      return
    }
    this.applyHallTab('normal')
  },
  goHomeEntry(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'publish') {
      wx.switchTab({ url: '/pages/publish/publish' })
      return
    }
    if (key === 'eval') {
      wx.navigateTo({ url: '/pages/subpack-mine/mine-local-life-eval/mine-local-life-eval' })
      return
    }
    if (key === 'course') {
      const courseUrl = '/pages/subpack-mine/mine-training/mine-training'
      if (!auth.isLoggedIn()) {
        require('../../utils/mpGuestRoutes.js').redirectToLogin(courseUrl)
        return
      }
      wx.navigateTo({ url: courseUrl })
      return
    }
    const identity = this.data.workIdentity || userProfile.readIdentity()
    const url =
      identity === 'pr'
        ? '/pages/subpack-pr/mine-pr-orders/mine-pr-orders'
        : '/pages/subpack-mine/mine-applications/mine-applications'
    if (!auth.isLoggedIn()) {
      require('../../utils/mpGuestRoutes.js').redirectToLogin(url)
      return
    }
    wx.navigateTo({ url })
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
      const loadToken = selectionHomePopup.beginLoad()
      const row = await selectionHomePopup.loadPendingSelectionNotice()
      if (!selectionHomePopup.loadEpochStill(loadToken)) return
      if (!row || this.data.showSelectionPopup || this.data.showPriceSheet) return
      if (require('../../utils/inboxNoticeState.js').isSelectionPopupDismissed(row)) return
      const payload = selectionHomePopup.toPopupPayload(row)
      if (!payload || !selectionHomePopup.loadEpochStill(loadToken)) return
      this._selectionPopupRow = row
      this.setData({ showSelectionPopup: true, selectionPopup: payload })
    } catch (e) {
      console.warn('[index] selection popup', e)
    } finally {
      this._selectionPopupLoading = false
    }
  },
  onSelectionPopupDismiss(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const stored = this._selectionPopupRow || this.data.selectionPopup || {}
    this._selectionPopupRow = null
    selectionHomePopup.dismissSelectionNotice({
      ...stored,
      id: stored.id || ds.id || '',
      title: stored.title || ds.title || '',
      body: stored.body || ds.body || '',
      mpOrderId: stored.mpOrderId || ds.mp || '',
    })
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
    loadHallList(this, { force: true })
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
    const pinned = this._hallRegion
    let provf = this.data.filterProvince
    let cf = this.data.filterCity
    if (pinned && (pinned.province !== provf || pinned.city !== cf)) {
      provf = pinned.province
      cf = pinned.city
      const regionState = regionFilterPicker.initRegionFilterState(provf, cf)
      if (regionState.filterProvince === '全部' && regionState.filterCity === '全部') {
        regionState.regionFilterLabel = '城市'
      }
      Object.assign(this.data, regionState)
      this.setData(regionState)
    }
    const priceSel = this.data.priceSelected
    const statusF = this.data.filterStatus
    rows = rows.filter((r) => {
      if (!listKeywordSearch.matchListKeyword(r, kw)) return false
      if (!hallFilters.matchPlatform(r.platform, pf)) return false
      if (regionNamesOtherCity(r.region, cf)) return false
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
        if (regionNamesOtherCity(r.region, cf)) return false
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
    this._regionPickerBusy = true
    const detail = e.detail || {}
    const next = regionFilterPicker.onRegionFilterColumnChange(
      {
        regionMultiRange: this.data.regionMultiRange,
        regionMultiValue: this.data.regionMultiValue,
      },
      detail.column,
      detail.value,
    )
    if (next) this.setData(next)
  },
  onRegionFilterCancel() {
    this._regionPickerBusy = false
  },
  onRegionFilterChange(e) {
    this._regionPickerBusy = false
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
      this._hallRegionUserPicked = false
    } else {
      hallRegionLocate.writeStoredFilter(next.filterProvince, next.filterCity)
      this._hallRegionUserPicked = true
    }
    rememberHallRegion(this, next.filterProvince, next.filterCity)
    Object.assign(this.data, next)
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
