const config = require('../../utils/config.js')
const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const userProfile = require('../../utils/userProfile.js')
const memberStore = require('../../utils/talentMember.js')
const listFilters = require('../../utils/recruitmentListFilters.js')
const hallFilters = require('../../utils/recruitmentHallFilters.js')
const orderCard = require('../../utils/recruitmentOrderCard.js')
const recruitmentAi = require('../../utils/recruitmentAiTags.js')
const talentChat = require('../../utils/talentChat.js')
const talentFavorites = require('../../utils/talentFavorites.js')
const participant = require('../../utils/participant.js')
const { setTabBarForPage } = require('../../utils/tabBar.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')

const MOCK_PREVIEW = {
  id: 'mock-preview',
  isPreview: true,
  name: '小美探店',
  avatar: '/images/logo.png',
  platform: '抖音',
  platformIcon: hallFilters.platformIcon('抖音'),
  followers: '12.8万',
  salesGrade: 'Lv3 带货达人',
  quality: '优质达人',
  tags: ['美食探店', '本地生活'],
  region: '上海',
  gender: '女',
  online: true,
}

const PLATFORM_FILTERS = hallFilters.PLATFORM_FILTERS
const TAG_FILTERS = ['全部', '优质', '推荐', '新锐', '会员', '美食', '亲子', '美妆']
const GENDER_FILTERS = ['全部', '男', '女']
const STATUS_FILTERS = ['全部', '已沟通', '已收藏']
const ORDER_SEGMENTS = [
  { id: 'quality', label: '优质' },
  { id: 'hot', label: '热门全国' },
  { id: 'city', label: '同城匹配' },
]

const TALENT_SEGMENTS = [
  { id: 'ai', label: '智能匹配' },
  { id: 'all', label: '全部达人' },
]

function readTalentCity() {
  const m = memberStore.readMember()
  if (!m) return ''
  return String(m.city || m.province || '').trim()
}

function formatFans(n) {
  const followers = Number(n) || 0
  if (followers >= 10000) return `${(followers / 10000).toFixed(1)}万`
  return `${followers}`
}

function salesGradeFromFollowers(n) {
  const f = Number(n) || 0
  if (f >= 100000) return 'Lv5 头部达人'
  if (f >= 50000) return 'Lv4 资深达人'
  if (f >= 10000) return 'Lv3 带货达人'
  if (f >= 3000) return 'Lv2 成长达人'
  return 'Lv1 新锐达人'
}

function buildSelfTalentTestCard() {
  const m = memberStore.readMember()
  const wxAcc = require('../../utils/wxAccount.js').readWxAccount()
  let row = null
  if (m && m.id) {
    const primary = memberStore.primaryPlatformProfile(m)
    const p = (primary && primary.profile) || {}
    const raw = Number(p.followers) || 0
    const tags = Array.isArray(p.accountTags) ? [...p.accountTags] : []
    row = formatTalent({
      id: m.id,
      platformNickname: p.platformNickname || m.wxNickName,
      wxAvatarUrl: m.wxAvatarUrl,
      platform: (primary && primary.platform) || '抖音',
      followers: raw,
      province: m.province,
      city: m.city,
      qualityTag: '我的资料',
      gender: m.gender,
      accountTags: tags,
      douyinSalesLevel: p.douyinSalesLevel || '',
    })
  } else if (wxAcc && (wxAcc.wxNickName || wxAcc.wxAvatarUrl)) {
    row = formatTalent({
      id: 'self-local-preview',
      platformNickname: wxAcc.wxNickName || '微信用户',
      wxAvatarUrl: wxAcc.wxAvatarUrl,
      platform: '抖音',
      followers: 0,
      qualityTag: '待完善',
      gender: '不限',
      accountTags: [],
    })
  }
  if (!row) return null
  return {
    ...row,
    isSelfTest: true,
    aiTag: '我的资料',
    aiTagTone: 'match',
    aiMatch: true,
  }
}

function prependSelfTalentTest(rows) {
  const self = buildSelfTalentTestCard()
  if (!self) return rows
  const rest = (rows || []).filter((r) => r && r.id !== self.id)
  return [self, ...rest]
}

function stampTalentStatus(rows, mutualKeySet, favoriteIdSet) {
  const mutual = mutualKeySet || new Set()
  const fav = favoriteIdSet || new Set()
  return (rows || []).map((r) => {
    if (!r || r.isPreview) return { ...r, chatMutual: false, favorited: false }
    const key = participant.talentParticipantKey({ id: r.id })
    return {
      ...r,
      chatMutual: mutual.has(key),
      favorited: fav.has(String(r.id)),
    }
  })
}

function loadFavoriteIdSet() {
  return talentFavorites.readIdSet()
}

function applyStatusFilters(rows, filterStatus) {
  const out = rows || []
  if (filterStatus === '已沟通') return out.filter((r) => r && r.chatMutual)
  if (filterStatus === '已收藏') return out.filter((r) => r && r.favorited)
  return out
}

function formatTalent(row) {
  const followersRaw = Number(row.followers) || 0
  const platform = row.platform || '抖音'
  const tags = []
  if (row.qualityTag) tags.push(row.qualityTag)
  if (row.niche && row.niche !== '本地生活') tags.push(String(row.niche).slice(0, 8))
  const accountTags = Array.isArray(row.accountTags) ? row.accountTags : []
  return {
    id: row.id,
    isPreview: false,
    name: row.platformNickname || row.name || '达人',
    avatar: row.avatarUrl || row.wxAvatarUrl || '',
    platform,
    platformIcon: hallFilters.platformIcon(platform),
    followers: formatFans(followersRaw),
    followersRaw,
    salesGrade: row.salesGrade || salesGradeFromFollowers(followersRaw),
    douyinSalesLevel: row.douyinSalesLevel || '',
    quality: row.qualityTag || (followersRaw >= 50000 ? '优质' : followersRaw >= 10000 ? '推荐' : '新锐'),
    tags: tags.length ? tags : ['本地生活'],
    accountTags,
    region: [row.province, row.city].filter(Boolean).join(' · ') || row.region || '',
    gender: row.gender || '不限',
    online: row.online !== false,
    matchScore: 0,
    aiTag: '',
    aiTagTone: 'default',
    aiMatch: false,
  }
}

function matchTalentFilters(row, f) {
  if (!hallFilters.matchPlatform(row.platform, f.platform)) return false
  if (!hallFilters.matchCity(row.region, '', f.city)) return false
  if (f.tag !== '全部') {
    const blob = [row.quality, ...(row.tags || [])].join(' ')
    if (!blob.includes(f.tag)) return false
  }
  if (f.gender !== '全部' && row.gender !== f.gender && row.gender !== '不限') return false
  return true
}

function matchTalentSearch(row, keyword) {
  if (!keyword) return true
  const k = keyword.toLowerCase()
  const blob = [row.id, row.name, row.platform, row.region, row.salesGrade, row.quality, ...(row.tags || [])]
    .join(' ')
    .toLowerCase()
  return blob.includes(k)
}

function matchOrderSearch(row, keyword) {
  if (!keyword) return true
  const k = keyword.toLowerCase()
  const blob = [row.title, row.merchantName, row.region, row.platform, row.category].join(' ').toLowerCase()
  return blob.includes(k)
}

function matchOrderSegment(row, segment, talentCity) {
  if (segment === 'quality') return row.recommended || row.urgent || (row.priceAmount || 0) >= 1000
  if (segment === 'city') {
    if (!talentCity) return false
    const region = String(row.region || '')
    if (region.includes('全国')) return false
    return region.includes(talentCity)
  }
  return true
}

Page({
  data: {
    recHeadBandStyle: '',
    recHeadInnerStyle: '',
    identity: 'talent',
    isPrMode: false,
    talentTestMode: false,
    talentTestHint: '',
    searchKeyword: '',
    loading: true,
    err: '',
    allRows: [],
    displayRows: [],
    listEmptyHint: '',
    filterPlatform: '全部',
    filterCity: '全部',
    filterTag: '全部',
    filterGender: '全部',
    filterStatus: '全部',
    platformFilters: PLATFORM_FILTERS,
    cityFilters: ['全部'],
    tagFilters: TAG_FILTERS,
    genderFilters: GENDER_FILTERS,
    statusFilters: STATUS_FILTERS,
    orderSegment: 'quality',
    orderSegments: ORDER_SEGMENTS,
    talentCity: '',
    orderCityHint: '',
    priceSelected: [],
    priceFilterLabel: '价格',
    showPriceSheet: false,
    priceBuckets: hallFilters.priceBucketsForView([]),
    allOrderRows: [],
    orderDisplayRows: [],
    orderEmptyHint: '',
    talentSegment: 'ai',
    talentSegments: TALENT_SEGMENTS,
    prOrderCount: 0,
    prMatchHint: '',
    registryCache: null,
  },
  async refreshMutualChatKeys() {
    this._mutualTalentKeys = new Set()
    if (!this.data.isPrMode || userProfile.readIdentity() !== 'pr' || !talentChat.canChat()) {
      return this._mutualTalentKeys
    }
    try {
      await talentChat.syncProfile()
      const keys = await talentChat.listMutualTalentKeysForPr()
      this._mutualTalentKeys = new Set(keys)
    } catch (e) {
      console.warn('[recommend] mutual talent keys', e)
      this._mutualTalentKeys = new Set()
    }
    return this._mutualTalentKeys
  },
  onLoad() {
    applyCapsulePadding(this, null, { band: 'recHeadBandStyle', right: 'recHeadInnerStyle' })
  },
  onShow() {
    setTabBarForPage(this, '/pages/recommend/recommend')
    applyCapsulePadding(this, null, { band: 'recHeadBandStyle', right: 'recHeadInnerStyle' })
    const identity = userProfile.readIdentity()
    const isPr = identity === 'pr'
    const talentTestMode = !isPr && config.MP_TEST_TALENT_ON_RECOMMEND === true
    const isPrMode = isPr || talentTestMode
    const talentCity = readTalentCity()
    const selfCard = buildSelfTalentTestCard()
    let talentTestHint = ''
    if (talentTestMode) {
      talentTestHint = selfCard
        ? '已把「我的信息」置顶，与 PR 在推荐达人中看到的卡片一致'
        : '请先在「我的」完善达人资料，或微信登录后再看预览'
    }
    this.setData({
      identity,
      isPrMode,
      talentTestMode,
      talentTestHint,
      talentCity,
      orderCityHint: talentCity ? `已按「${talentCity}」匹配同城商单` : '完善达人资料后可匹配同城商单',
      prMatchHint: talentTestMode ? talentTestHint : '',
    })
    if (userProfile.readIdentity() === 'pr') {
      this._favoriteTalentIds = loadFavoriteIdSet()
    } else {
      this._favoriteTalentIds = new Set()
    }
    if (isPrMode) this.loadTalentList()
    else this.loadOrderList()
  },
  async loadTalentList() {
    if (!merchant.hasMerchantApi()) {
      const preview = prependSelfTalentTest([MOCK_PREVIEW])
      this.setData({
        loading: false,
        err: '未配置后台地址',
        allRows: preview,
        displayRows: preview,
        listEmptyHint: '',
      })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry()
      const library = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
      const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
      const fromLib = library.map((e) => {
        const raw = Number(e.followers) || 0
        return formatTalent({
          ...e,
          id: e.id,
          qualityTag: raw >= 50000 ? '优质' : '推荐',
          gender: e.gender,
        })
      })
      const fromMembersEnriched = members.map((m) => {
        const primary = memberStore.primaryPlatformProfile(m)
        const p = (primary && primary.profile) || {}
        const raw = Number(p.followers) || 0
        const tags = Array.isArray(p.accountTags) ? [...p.accountTags] : []
        return formatTalent({
          id: m.id,
          platformNickname: p.platformNickname || m.wxNickName,
          wxAvatarUrl: m.wxAvatarUrl,
          platform: (primary && primary.platform) || '抖音',
          followers: raw,
          province: m.province,
          city: m.city,
          qualityTag: '会员',
          gender: m.gender,
          accountTags: tags,
          douyinSalesLevel: p.douyinSalesLevel || '',
        })
      })
      let merged = [...fromLib, ...fromMembersEnriched].sort(
        (a, b) => (b.followersRaw || 0) - (a.followersRaw || 0),
      )
      merged = prependSelfTalentTest(merged)
      const prPacks = recruitmentAi.resolvePrRecentOrders(reg)
      const prOrderCount = prPacks.length
      let prMatchHint = '发招募后，将按您的招募要求智能推荐达人'
      if (prOrderCount > 0) {
        prMatchHint = `已根据您最近 ${prOrderCount} 条发单要求智能匹配达人`
      }
      this.setData({
        allRows: merged.slice(0, 50),
        cityFilters: hallFilters.buildCityFilterOptions(merged),
        prOrderCount,
        prMatchHint,
        registryCache: reg,
        talentSegment: prOrderCount > 0 ? 'ai' : 'all',
        loading: false,
      })
      if (userProfile.readIdentity() === 'pr') await this.refreshMutualChatKeys()
      this.applyTalentFilters()
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e.message || e),
        allRows: [],
        displayRows: [MOCK_PREVIEW],
      })
    }
  },
  async loadOrderList() {
    const mocks = listFilters.buildMockRecruitmentRows()
    if (!merchant.hasMerchantApi()) {
      this.setData({ loading: false, err: '', allOrderRows: mocks })
      this.applyOrderFilters()
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry()
      let rows = orderCard.loadOpenOrderRows(reg)
      if (!rows.length) rows = mocks
      else rows = [...mocks, ...rows]
      this.setData({
        allOrderRows: rows,
        cityFilters: hallFilters.buildCityFilterOptions(rows),
        loading: false,
      })
      this.applyOrderFilters()
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e.message || e),
        allOrderRows: mocks,
      })
      this.applyOrderFilters()
    }
  },
  async applyTalentFilters() {
    const f = {
      platform: this.data.filterPlatform,
      city: this.data.filterCity,
      tag: this.data.filterTag,
      gender: this.data.filterGender,
    }
    const kw = String(this.data.searchKeyword || '').trim()
    const segment = this.data.talentSegment
    let filtered = this.data.allRows.filter((r) => matchTalentFilters(r, f) && matchTalentSearch(r, kw))

    const token = Date.now()
    this._talentFilterToken = token

    if (segment === 'ai' && this.data.prOrderCount > 0 && this.data.registryCache && filtered.length) {
      wx.showLoading({ title: '智能匹配中…', mask: false })
      try {
        filtered = await recruitmentAi.enrichTalentMatchesForPr(filtered, this.data.registryCache)
      } catch (_) {
        const packs = recruitmentAi.resolvePrRecentOrders(this.data.registryCache)
        const payloads = packs.map((p) => p.payload)
        filtered = filtered.map((t) => {
          const fb = recruitmentAi.fallbackTalentScore(t, payloads)
          return {
            ...t,
            matchScore: fb.score,
            aiTag: fb.tag,
            aiTagTone: fb.tone,
            aiMatch: fb.score >= 55,
          }
        })
        filtered.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      } finally {
        wx.hideLoading()
      }
      if (this._talentFilterToken !== token) return
      filtered = filtered.filter((t) => (t.matchScore || 0) >= 45)
    } else if (segment === 'ai' && !this.data.prOrderCount) {
      filtered = filtered
        .slice()
        .sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
    } else {
      filtered = filtered
        .slice()
        .sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
    }

    const showPreview =
      !kw && segment === 'ai' && !this.data.prOrderCount && filtered.length === 0
    let displayRows = filtered.slice(0, 50)
    if (showPreview) {
      displayRows = [MOCK_PREVIEW]
    }
    let listEmptyHint = ''
    if (displayRows.length === 0) {
      if (segment === 'ai' && this.data.prOrderCount > 0) {
        listEmptyHint = kw ? `未找到「${kw}」相关达人` : '暂无高匹配达人，可切换「全部达人」或调整筛选'
      } else {
        listEmptyHint = kw ? `未找到「${kw}」相关达人` : '筛选后暂无更多达人'
      }
    } else if (showPreview && displayRows.length === 1 && displayRows[0].isPreview) {
      listEmptyHint = '发招募后可在此查看 AI 匹配的达人'
    } else if (segment === 'ai' && this.data.prOrderCount > 0 && displayRows.length > 0) {
      listEmptyHint = ''
    }
    if (userProfile.readIdentity() === 'pr') {
      if (!this._favoriteTalentIds) this._favoriteTalentIds = loadFavoriteIdSet()
      displayRows = stampTalentStatus(
        displayRows,
        this._mutualTalentKeys,
        this._favoriteTalentIds,
      )
      displayRows = applyStatusFilters(displayRows, this.data.filterStatus)
    }
    if (displayRows.length === 0 && !showPreview && this.data.filterStatus !== '全部') {
      listEmptyHint = `暂无「${this.data.filterStatus}」的达人`
    }
    this.setData({ displayRows, listEmptyHint })
  },
  onTalentSegment(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.talentSegment) return
    this.setData({ talentSegment: id })
    this.applyTalentFilters()
  },
  async applyOrderFilters() {
    const segment = this.data.orderSegment
    const talentCity = this.data.talentCity
    const kw = String(this.data.searchKeyword || '').trim()
    const pf = this.data.filterPlatform
    const cf = this.data.filterCity
    const priceSel = this.data.priceSelected
    let rows = (this.data.allOrderRows || []).filter((r) => {
      if (!matchOrderSearch(r, kw)) return false
      if (!hallFilters.matchPlatform(r.platform, pf)) return false
      if (!hallFilters.matchCity(r.region, r.storeName, cf)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSel)) return false
      if (!matchOrderSegment(r, segment, talentCity)) return false
      return true
    })
    const mocks = rows.filter((r) => r.isMock)
    let real = rows.filter((r) => !r.isMock)
    const member = memberStore.readMember()
    if (member && merchant.hasMerchantApi() && real.length) {
      real = await recruitmentAi.enrichOrderMatches(real, member)
    } else {
      real = real.map((r) => ({
        ...r,
        ...recruitmentAi.fallbackTagForRow(r, talentCity),
        matchScore: 0,
        aiTagSource: 'local',
      }))
    }
    rows = [...mocks, ...real]
    if (segment === 'hot' && !member) {
      rows.sort((a, b) => {
        if (a.isMock) return -1
        if (b.isMock) return 1
        const d = (b.applicantCount || 0) - (a.applicantCount || 0)
        if (d !== 0) return d
        return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
      })
    } else if (segment === 'quality' && !member) {
      const sorted = listFilters.sortRecruitmentRows(
        rows.filter((r) => !r.isMock),
        '价格从高到低',
      )
      rows = [...mocks, ...sorted]
    } else if (!member) {
      const sorted = listFilters.sortRecruitmentRows(rows.filter((r) => !r.isMock), '发布时间')
      rows = [...mocks, ...sorted]
    }
    let orderEmptyHint = ''
    if (!rows.length) {
      if (segment === 'city' && !talentCity) orderEmptyHint = '请先在「我的」完善城市信息'
      else if (segment === 'city') orderEmptyHint = `暂无「${talentCity}」同城商单，可看看热门全国`
      else orderEmptyHint = '暂无匹配商单，试试切换分类或筛选'
    }
    this.setData({ orderDisplayRows: rows.slice(0, 50), orderEmptyHint })
  },
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
    if (this.data.isPrMode) this.applyTalentFilters()
    else this.applyOrderFilters()
  },
  onSearchConfirm(e) {
    this.setData({ searchKeyword: e.detail.value || '' })
    if (this.data.isPrMode) this.applyTalentFilters()
    else this.applyOrderFilters()
  },
  onSearchClear() {
    this.setData({ searchKeyword: '' })
    if (this.data.isPrMode) this.applyTalentFilters()
    else this.applyOrderFilters()
  },
  onPlatformFilter(e) {
    this.setData({
      filterPlatform: this.data.platformFilters[Number(e.detail.value)] || '全部',
    })
    if (this.data.isPrMode) this.applyTalentFilters()
    else this.applyOrderFilters()
  },
  onCityFilter(e) {
    this.setData({ filterCity: this.data.cityFilters[Number(e.detail.value)] || '全部' })
    if (this.data.isPrMode) this.applyTalentFilters()
    else this.applyOrderFilters()
  },
  onTagFilter(e) {
    this.setData({ filterTag: this.data.tagFilters[Number(e.detail.value)] || '全部' })
    this.applyTalentFilters()
  },
  onGenderFilter(e) {
    this.setData({ filterGender: this.data.genderFilters[Number(e.detail.value)] || '全部' })
    this.applyTalentFilters()
  },
  onStatusFilter(e) {
    this.setData({
      filterStatus: this.data.statusFilters[Number(e.detail.value)] || '全部',
    })
    this.applyTalentFilters()
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
      priceFilterLabel: hallFilters.priceFilterLabel(priceSelected, '价格'),
    })
    this.applyOrderFilters()
  },
  onOrderSegment(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.orderSegment) return
    this.setData({ orderSegment: id })
    this.applyOrderFilters()
  },
  goOrderDetail(e) {
    const id = e.currentTarget.dataset.id
    const isMock = e.currentTarget.dataset.mock
    if (!id) return
    if (isMock) {
      wx.showToast({ title: '演示商单，仅供预览', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
  goEditSelfProfile() {
    wx.navigateTo({ url: '/pages/register/register?edit=1' })
  },
  onToggleFavorite(e) {
    if (userProfile.readIdentity() !== 'pr') {
      wx.showToast({ title: '请切换为 PR 身份', icon: 'none' })
      return
    }
    const id = e.currentTarget.dataset.id
    if (!id || id === 'mock-preview') return
    const favorited = talentFavorites.toggleFavorite(id)
    if (!this._favoriteTalentIds) this._favoriteTalentIds = new Set()
    if (favorited) this._favoriteTalentIds.add(String(id))
    else this._favoriteTalentIds.delete(String(id))
    const displayRows = applyStatusFilters(
      (this.data.displayRows || []).map((r) => (r && r.id === id ? { ...r, favorited } : r)),
      this.data.filterStatus,
    )
    this.setData({ displayRows })
    wx.showToast({
      title: favorited ? '已收藏' : '已取消收藏',
      icon: 'none',
      duration: 1200,
    })
  },
  async onChatTap(e) {
    const id = e.currentTarget.dataset.id
    const chat = require('../../utils/talentChat.js')
    if (this.data.talentTestMode && this.data.identity !== 'pr') {
      wx.showModal({
        title: '测试沟通',
        content: '请先在「我的」切换为 PR 身份，再点「沟通」向达人（含您自己的资料卡）发起私信。',
        showCancel: false,
      })
      return
    }
    if (!chat.canChat()) {
      wx.showModal({
        title: '未连接后台',
        content: '请在 config.local.js 配置 MERCHANT_API_BASE_URL 后使用私信。',
        showCancel: false,
      })
      return
    }
    if (userProfile.readIdentity() !== 'pr') {
      wx.showModal({
        title: '达人身份',
        content: '请先在「我的」切换为 PR 身份，再向达人发起沟通。',
        showCancel: false,
      })
      return
    }
    const row = (this.data.displayRows || []).find((r) => r.id === id)
    const name = row ? row.name : '达人'
    const avatar = row ? row.avatar || '' : ''
    wx.showLoading({ title: '连接中' })
    try {
      await chat.syncProfile()
      const sessionId = await chat.ensureSessionWithTalent({
        id,
        talentMemberId: id === 'mock-preview' ? 'mock-preview' : id,
        name,
        avatar,
      })
      wx.hideLoading()
      wx.navigateTo({
        url:
          `/pages/chat/chat?sessionId=${encodeURIComponent(sessionId)}` +
          `&peerName=${encodeURIComponent(name)}` +
          `&peerAvatar=${encodeURIComponent(avatar)}`,
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: String(err.message || '无法发起会话'), icon: 'none' })
    }
  },
})
