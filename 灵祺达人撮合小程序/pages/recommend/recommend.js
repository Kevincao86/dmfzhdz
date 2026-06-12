const auth = require('../../utils/auth.js')
const config = require('../../utils/config.js')
const { showDemoOrders } = require('../../utils/mpDemoMode.js')
const api = require('../../utils/api.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const userProfile = require('../../utils/userProfile.js')
const memberStore = require('../../utils/talentMember.js')
const listFilters = require('../../utils/recruitmentListFilters.js')
const hallFilters = require('../../utils/recruitmentHallFilters.js')
const orderCard = require('../../utils/recruitmentOrderCard.js')
const recruitmentAi = require('../../utils/recruitmentAiTags.js')
const recommendHall = require('../../utils/recommendHallFilters.js')
const identityTypes = require('../../utils/identityTypes.js')
const prBoard = require('../../utils/prRecommendBoard.js')
const prMatchOrderSelect = require('../../utils/prMatchOrderSelect.js')
const talentChat = require('../../utils/talentChat.js')
const talentFavorites = require('../../utils/talentFavorites.js')
const participant = require('../../utils/participant.js')
const { setTabBarForPage } = require('../../utils/tabBar.js')
const mpShare = require('../../utils/mpShare.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const prMatchStore = require('../../utils/prRecommendMatchStore.js')

function sortByMatchScoreDesc(rows, tieBreak) {
  return (rows || []).slice().sort((a, b) => {
    const d = (b.matchScore || 0) - (a.matchScore || 0)
    if (d !== 0) return d
    return tieBreak ? tieBreak(a, b) : 0
  })
}

function dedupeTalentRows(rows) {
  const seen = new Set()
  const out = []
  for (let i = 0; i < (rows || []).length; i += 1) {
    const r = rows[i]
    if (!r) continue
    const id = String(r.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(r)
  }
  return out
}

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
  { id: 'match', label: '智能匹配' },
  { id: 'quality', label: '优质' },
  { id: 'hot', label: '热门全国' },
  { id: 'city', label: '同城' },
]

function orderMatchHint(identity, talentCity) {
  const label = identityTypes.workIdentityLabel(identity)
  if (identity === 'shoot') {
    return '已识别为拍摄团队 · 按标签与接单习惯匹配，匹配分从高到低'
  }
  if (identity === 'edit') {
    return '已识别为剪辑团队 · 按标签与接单习惯匹配，匹配分从高到低'
  }
  if (identity === 'talent') {
    return talentCity
      ? `已识别为${label} · 按您的标签与报名习惯智能匹配，匹配分从高到低`
      : '完善资料后，AI 将按标签与报名习惯为您匹配商单'
  }
  return ''
}

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

const listKeywordSearch = require('../../utils/listKeywordSearch.js')

function matchOrderSearch(row, keyword) {
  return listKeywordSearch.matchListKeyword(row, keyword)
}

function matchOrderSegment(row, segment, talentCity) {
  if (segment === 'match') return true
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
    matchingLoading: false,
    needPrLogin: false,
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
    orderSegment: 'match',
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
    prBoard: 'talent',
    prBoardSegments: prBoard.PR_BOARD_SEGMENTS,
    prBoardOrderCount: 0,
    prSearchPlaceholder: '搜索达人昵称、ID',
    prOrderCount: 0,
    prMatchHint: '',
    prMatchOrderId: prMatchOrderSelect.PR_MATCH_RECENT,
    prMatchOrderOptions: [],
    prMatchOrderLabels: [],
    prMatchOrderIndex: 0,
    prMatchOrderLabel: '',
    showPrMatchOrderSheet: false,
    prMatchOrderKeyword: '',
    prMatchOrderFiltered: [],
    registryCache: null,
    prViewMode: 'ai',
    prAllModeLabel: '全部达人',
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
  onShareAppMessage() {
    mpShare.enableShareMenu()
    return mpShare.defaultShare('/pages/recommend/recommend')
  },
  onShareTimeline() {
    return mpShare.defaultTimelineShare()
  },
  async onShow() {
    mpShare.enableShareMenu()
    setTabBarForPage(this, '/pages/recommend/recommend')
    applyCapsulePadding(this, null, { band: 'recHeadBandStyle', right: 'recHeadInnerStyle' })
    const identity = userProfile.readIdentity()
    const isPr = identity === 'pr'
    const talentTestMode = !isPr && config.MP_TEST_TALENT_ON_RECOMMEND === true
    const isPrMode = isPr || talentTestMode
    const defaultMatchOptions = prMatchOrderSelect.buildPrMatchOrderOptions([])
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
      identityLabel: identityTypes.workIdentityLabel(identity),
      isPrMode,
      talentTestMode,
      talentTestHint,
      talentCity,
      orderCityHint: orderMatchHint(identity, talentCity),
      prMatchHint: talentTestMode
        ? talentTestHint
        : prBoard.boardMatchHint('talent', 0),
      prSearchPlaceholder: prBoard.boardSearchPlaceholder('talent'),
      prAllModeLabel: prBoard.boardAllModeLabel('talent'),
      prMatchOrderOptions: isPrMode ? defaultMatchOptions : [],
      prMatchOrderLabels: isPrMode ? defaultMatchOptions.map((o) => o.label) : [],
      prMatchOrderLabel: isPrMode ? (defaultMatchOptions[0] && defaultMatchOptions[0].label) || '' : '',
    })
    if (userProfile.readIdentity() === 'pr') {
      this._favoriteTalentIds = loadFavoriteIdSet()
    } else {
      this._favoriteTalentIds = new Set()
    }
    if (isPr && auth.isLoggedIn()) {
      try {
        await require('../../utils/mpAccountClientSync.js').pullAfterLogin()
      } catch (_) {}
    }
    if (!isPrMode) hallCountdownTick.startHallCountdownTick(this, 'orderDisplayRows')
    else hallCountdownTick.stopHallCountdownTick(this)
    const loggedIn = auth.isLoggedIn()
    if (isPrMode && !loggedIn && !talentTestMode) {
      this.setData({
        loading: false,
        matchingLoading: false,
        needPrLogin: true,
        displayRows: [],
        listEmptyHint: '',
        err: '',
        registryCache: null,
      })
      this._boardPools = null
      this.clearPrMatchEnrichedCache()
      return
    }
    this.setData({ needPrLogin: false })
    if (isPrMode) {
      if (this.data.registryCache && this._enrichedTalentPool && this._prMatchCacheKey) {
        this.applyTalentFilters()
        return
      }
      this.loadTalentList()
    } else this.loadOrderList()
  },
  onHide() {
    hallCountdownTick.stopHallCountdownTick(this)
  },
  onUnload() {
    hallCountdownTick.stopHallCountdownTick(this)
  },
  async loadTalentList() {
    if (!auth.isLoggedIn()) {
      this.setData({
        loading: false,
        matchingLoading: false,
        needPrLogin: true,
        displayRows: [],
        listEmptyHint: '',
      })
      return
    }
    if (!api.hasApi()) {
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
      const reg = await ops.fetchRegistry({ includeRecommendPool: true })
      const board = this.data.prBoard || 'talent'
      this._boardPools = {
        talent: prBoard.buildBoardPool(reg, 'talent'),
        shoot: prBoard.buildBoardPool(reg, 'shoot'),
        edit: prBoard.buildBoardPool(reg, 'edit'),
      }
      const pool = this._boardPools[board] || []
      require('../../utils/recommendPoolVerify.js').logRecommendPoolParity(reg, board)
      const prBoardOrderCount = prBoard.countPrOrdersForBoard(reg, board)
      const eligible = recruitmentAi.listPrEligibleOrders(reg, { board })
      const matchOptions = prMatchOrderSelect.buildPrMatchOrderOptions(eligible)
      let matchOrderId = prMatchOrderSelect.readPrMatchOrderId(board)
      if (
        matchOrderId !== prMatchOrderSelect.PR_MATCH_RECENT &&
        !matchOptions.some((o) => o.id === matchOrderId)
      ) {
        matchOrderId = prMatchOrderSelect.PR_MATCH_RECENT
        prMatchOrderSelect.writePrMatchOrderId(board, matchOrderId)
      }
      const matchOrderIndex = Math.max(
        0,
        matchOptions.findIndex((o) => o.id === matchOrderId),
      )
      const prOrderCount = recruitmentAi.resolvePrRecentOrders(reg).length
      const rowsForCity = [
        ...this._boardPools.talent,
        ...this._boardPools.shoot,
        ...this._boardPools.edit,
      ]
      this.setData({
        allRows: pool,
        cityFilters: hallFilters.buildCityFilterOptions(rowsForCity),
        prOrderCount,
        prBoardOrderCount,
        prMatchOrderId: matchOrderId,
        prMatchOrderOptions: matchOptions,
        prMatchOrderLabels: matchOptions.map((o) => o.label),
        prMatchOrderIndex: matchOrderIndex,
        prMatchOrderLabel: (matchOptions[matchOrderIndex] || matchOptions[0] || {}).label || '',
        prMatchHint: prMatchOrderSelect.matchHintForSelection(
          board,
          matchOrderId,
          matchOptions,
          prBoardOrderCount,
        ),
        prSearchPlaceholder: prBoard.boardSearchPlaceholder(board),
        registryCache: reg,
        loading: false,
      })
      const packs = recruitmentAi.resolvePrMatchOrders(reg, { board, mpOrderId: matchOrderId })
      const nextSig = prMatchStore.buildOrderSig(packs)
      const nextKey = prMatchStore.buildMatchCacheKey(board, matchOrderId, nextSig)
      if (this._prMatchCacheKey && this._prMatchCacheKey !== nextKey) {
        this.clearPrMatchEnrichedCache()
      }
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
    const allowDemo = showDemoOrders()
    if (!api.hasApi()) {
      this.setData({
        loading: false,
        err: allowDemo ? '' : '未连接后台',
        allOrderRows: allowDemo ? mocks : [],
      })
      this.applyOrderFilters()
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry()
      const identity = userProfile.readIdentity()
      let rows = recommendHall.filterRecommendHallOrders(orderCard.loadAllOrderRows(reg), identity)
      if (allowDemo) {
        const demoFiltered = recommendHall.filterRecommendHallOrders(mocks, identity)
        if (!rows.length) rows = demoFiltered
        else rows = [...demoFiltered, ...rows]
      }
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
        allOrderRows: allowDemo ? mocks : [],
      })
      this.applyOrderFilters()
    }
  },
  clearPrMatchEnrichedCache() {
    this._prMatchCacheKey = ''
    this._enrichedTalentPool = null
    this._enrichInflight = null
  },
  async ensureEnrichedTalentPool(board, matchOrderId) {
    const reg = this.data.registryCache
    const pool = (this._boardPools && this._boardPools[board]) || this.data.allRows || []
    if (!reg || !pool.length) return pool
    const packs = recruitmentAi.resolvePrMatchOrders(reg, { board, mpOrderId: matchOrderId })
    const orderSig = prMatchStore.buildOrderSig(packs)
    const cacheKey = prMatchStore.buildMatchCacheKey(board, matchOrderId, orderSig)
    if (this._prMatchCacheKey === cacheKey && this._enrichedTalentPool) {
      return this._enrichedTalentPool
    }
    const stored = prMatchStore.readEnrichedRows(cacheKey)
    if (stored && stored.length) {
      const rows = dedupeTalentRows(stored)
      this._prMatchCacheKey = cacheKey
      this._enrichedTalentPool = rows
      return rows
    }
    if (this._enrichInflight && this._enrichInflightKey === cacheKey) {
      return this._enrichInflight
    }
    this.setData({ matchingLoading: true })
    const task = (async () => {
      let enriched = pool
      try {
        enriched = dedupeTalentRows(
          await recruitmentAi.enrichTalentMatchesForPr(pool, reg, {
            board,
            mpOrderId: matchOrderId,
          }),
        )
      } catch (_) {
        const payloads = packs.map((p) => p.payload)
        enriched = dedupeTalentRows(
          pool.map((t) => {
            const fb = recruitmentAi.fallbackTalentScore(t, payloads, board)
            return {
              ...t,
              matchScore: fb.score,
              aiTag: fb.tag,
              aiTagTone: fb.tone,
              aiMatch: fb.score >= 55,
              aiTagSource: 'local',
            }
          }),
        )
      } finally {
        this.setData({ matchingLoading: false })
        this._enrichInflight = null
        this._enrichInflightKey = ''
      }
      prMatchStore.writeEnrichedRows(cacheKey, enriched)
      this._prMatchCacheKey = cacheKey
      this._enrichedTalentPool = enriched
      return enriched
    })()
    this._enrichInflight = task
    this._enrichInflightKey = cacheKey
    return task
  },
  async applyTalentFilters() {
    if (this.data.needPrLogin || !auth.isLoggedIn()) {
      this.setData({ loading: false, matchingLoading: false, displayRows: [], listEmptyHint: '' })
      return
    }
    const board = this.data.prBoard || 'talent'
    const pool =
      (this._boardPools && this._boardPools[board]) || this.data.allRows || []
    const f = {
      platform: this.data.filterPlatform,
      city: this.data.filterCity,
      tag: this.data.filterTag,
      gender: this.data.filterGender,
    }
    const kw = String(this.data.searchKeyword || '').trim()
    let filtered = pool.filter((r) => matchTalentFilters(r, f) && matchTalentSearch(r, kw))

    const token = Date.now()
    this._talentFilterToken = token

    if (this.data.prViewMode === 'all') {
      filtered = dedupeTalentRows(filtered)
        .slice()
        .sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
      if (this._talentFilterToken !== token) return
      let displayRows = filtered.slice(0, 100)
      if (userProfile.readIdentity() === 'pr') {
        if (!this._favoriteTalentIds) this._favoriteTalentIds = loadFavoriteIdSet()
        displayRows = stampTalentStatus(
          displayRows,
          this._mutualTalentKeys,
          this._favoriteTalentIds,
        )
        displayRows = applyStatusFilters(displayRows, this.data.filterStatus)
      }
      let listEmptyHint = ''
      if (!displayRows.length) {
        const label = this.data.prAllModeLabel || prBoard.boardAllModeLabel(board)
        listEmptyHint = kw
          ? `未找到「${kw}」相关结果`
          : `暂无已注册的${String(label).replace('全部', '')}`
      }
      if (displayRows.length === 0 && this.data.filterStatus !== '全部') {
        listEmptyHint = `暂无「${this.data.filterStatus}」的达人`
      }
      this.setData({ displayRows, listEmptyHint })
      return
    }

    const matchOrderId = this.data.prMatchOrderId || prMatchOrderSelect.PR_MATCH_RECENT
    const hasMatchOrders =
      matchOrderId !== prMatchOrderSelect.PR_MATCH_RECENT
        ? (this.data.prMatchOrderOptions || []).some((o) => o.id === matchOrderId)
        : this.data.prBoardOrderCount > 0

    if (!hasMatchOrders) {
      if (this._talentFilterToken !== token) return
      this.setData({
        displayRows: [],
        listEmptyHint: prBoard.smartMatchNeedRecruitHint(board),
      })
      return
    }

    if (hasMatchOrders && this.data.registryCache && pool.length) {
      const enrichedPool = await this.ensureEnrichedTalentPool(board, matchOrderId)
      if (this._talentFilterToken !== token) return
      filtered = enrichedPool.filter((r) => matchTalentFilters(r, f) && matchTalentSearch(r, kw))
      filtered = sortByMatchScoreDesc(filtered, (a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
      filtered = filtered.filter((t) => (t.matchScore || 0) >= 60)
      filtered = sortByMatchScoreDesc(filtered, (a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
    }

    filtered = dedupeTalentRows(filtered)

    if (board === 'talent' && this.data.talentTestMode) {
      filtered = prependSelfTalentTest(filtered)
    }

    let displayRows = filtered.slice(0, 50)
    let listEmptyHint = ''
    if (displayRows.length === 0) {
      listEmptyHint = prBoard.boardEmptyHint(board, kw, hasMatchOrders)
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
    if (displayRows.length === 0 && this.data.filterStatus !== '全部') {
      listEmptyHint = `暂无「${this.data.filterStatus}」的达人`
    }
    if (this._talentFilterToken !== token) return
    this.setData({ displayRows, listEmptyHint })
  },
  onPrBoard(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.prBoard) return
    this._talentFilterToken = (this._talentFilterToken || 0) + 1
    this.clearPrMatchEnrichedCache()
    const pool = (this._boardPools && this._boardPools[id]) || []
    const reg = this.data.registryCache
    const prBoardOrderCount = reg ? prBoard.countPrOrdersForBoard(reg, id) : 0
    const eligible = reg ? recruitmentAi.listPrEligibleOrders(reg, { board: id }) : []
    const matchOptions = prMatchOrderSelect.buildPrMatchOrderOptions(eligible)
    let matchOrderId = prMatchOrderSelect.readPrMatchOrderId(id)
    if (
      matchOrderId !== prMatchOrderSelect.PR_MATCH_RECENT &&
      !matchOptions.some((o) => o.id === matchOrderId)
    ) {
      matchOrderId = prMatchOrderSelect.PR_MATCH_RECENT
      prMatchOrderSelect.writePrMatchOrderId(id, matchOrderId)
    }
    const matchOrderIndex = Math.max(
      0,
      matchOptions.findIndex((o) => o.id === matchOrderId),
    )
    this.setData({
      prBoard: id,
      prViewMode: 'ai',
      allRows: pool,
      displayRows: [],
      listEmptyHint: '',
      prBoardOrderCount,
      prMatchOrderId: matchOrderId,
      prMatchOrderOptions: matchOptions,
      prMatchOrderLabels: matchOptions.map((o) => o.label),
      prMatchOrderIndex: matchOrderIndex,
      prMatchOrderLabel: (matchOptions[matchOrderIndex] || matchOptions[0] || {}).label || '',
      prMatchHint: prMatchOrderSelect.matchHintForSelection(
        id,
        matchOrderId,
        matchOptions,
        prBoardOrderCount,
      ),
      prSearchPlaceholder: prBoard.boardSearchPlaceholder(id),
      prAllModeLabel: prBoard.boardAllModeLabel(id),
    })
    this.applyTalentFilters()
  },
  refreshPrMatchOrderFiltered(keyword) {
    const kw = keyword != null ? keyword : this.data.prMatchOrderKeyword
    const filtered = prMatchOrderSelect.filterPrMatchOrderOptions(this.data.prMatchOrderOptions || [], kw)
    this.setData({ prMatchOrderFiltered: filtered })
  },
  openPrMatchOrderSheet() {
    this.setData({ showPrMatchOrderSheet: true, prMatchOrderKeyword: '' })
    this.refreshPrMatchOrderFiltered('')
  },
  closePrMatchOrderSheet() {
    this.setData({ showPrMatchOrderSheet: false, prMatchOrderKeyword: '' })
  },
  onPrMatchOrderKeyword(e) {
    const kw = e.detail.value || ''
    this.setData({ prMatchOrderKeyword: kw })
    this.refreshPrMatchOrderFiltered(kw)
  },
  onPrMatchOrderPick(e) {
    const id = e.currentTarget.dataset.id
    const opts = this.data.prMatchOrderOptions || []
    const hit = opts.find((o) => o.id === id)
    if (!hit) return
    if (hit.id !== this.data.prMatchOrderId) {
      this._talentFilterToken = (this._talentFilterToken || 0) + 1
      this.clearPrMatchEnrichedCache()
    }
    const board = this.data.prBoard || 'talent'
    const idx = Math.max(0, opts.findIndex((o) => o.id === hit.id))
    prMatchOrderSelect.writePrMatchOrderId(board, hit.id)
    this.setData({
      showPrMatchOrderSheet: false,
      prMatchOrderKeyword: '',
      prMatchOrderId: hit.id,
      displayRows: [],
      listEmptyHint: '',
      prMatchOrderIndex: idx,
      prMatchOrderLabel: hit.label,
      prMatchHint: prMatchOrderSelect.matchHintForSelection(
        board,
        hit.id,
        opts,
        this.data.prBoardOrderCount,
      ),
    })
    this.applyTalentFilters()
  },
  onPrViewMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.prViewMode) return
    this._talentFilterToken = (this._talentFilterToken || 0) + 1
    this.setData({ prViewMode: mode, displayRows: [], listEmptyHint: '' })
    this.applyTalentFilters()
  },
  async applyOrderFilters() {
    const segment = this.data.orderSegment
    const talentCity = this.data.talentCity
    const identity = this.data.identity || userProfile.readIdentity()
    const member = memberStore.readMember()
    if (segment === 'match' && !memberStore.hasFilledPlatform(member)) {
      this.setData({
        orderDisplayRows: [],
        orderEmptyHint: '请补充平台资料，以便AI匹配商单',
      })
      return
    }
    const kw = String(this.data.searchKeyword || '').trim()
    const pf = this.data.filterPlatform
    const cf = this.data.filterCity
    const priceSel = this.data.priceSelected
    let rows = (this.data.allOrderRows || []).filter((r) => {
      if (!recommendHall.orderMatchesRecommendHallIdentity(r, identity)) return false
      if (!recommendHall.isRecommendHallRecruitingStatus(r)) return false
      if (!matchOrderSearch(r, kw)) return false
      if (!hallFilters.matchPlatform(r.platform, pf)) return false
      if (!hallFilters.matchCity(r.region, r.storeName, cf)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSel)) return false
      if (!matchOrderSegment(r, segment, talentCity)) return false
      return true
    })
    let real = rows.filter((r) => r && !r.isMock)
    const mocks = showDemoOrders() ? rows.filter((r) => r && r.isMock) : []
    if (api.hasApi() && real.length) {
      real = await recruitmentAi.enrichOrderMatches(real, member, { workIdentity: identity })
    } else if (real.length) {
      real = await recruitmentAi.enrichOrderTags(real, { talentCity })
      real = real.map((r) => ({ ...r, matchScore: 0, aiMatch: false }))
    }
    const enrichedAll = real
    if (segment === 'match' && enrichedAll.length) {
      const matched = enrichedAll.filter((r) => (r.matchScore || 0) >= 40 || r.aiMatch)
      real = matched.length ? matched : enrichedAll
    }
    real = sortByMatchScoreDesc(real, (a, b) => {
      if (segment === 'hot') {
        const h = (b.applicantCount || 0) - (a.applicantCount || 0)
        if (h !== 0) return h
      }
      if (segment === 'quality') {
        const p = (b.priceAmount || 0) - (a.priceAmount || 0)
        if (p !== 0) return p
      }
      return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
    })
    rows = [...real, ...mocks]
    let orderEmptyHint = ''
    if (!rows.length) {
      if (segment === 'city' && !talentCity) orderEmptyHint = '请先在「我的」完善城市信息'
      else if (segment === 'city') orderEmptyHint = `暂无「${talentCity}」同城商单，可看看热门全国`
      else orderEmptyHint = '暂无匹配商单，试试切换分类或筛选'
    }
    this.setData({
      orderDisplayRows: listFilters.attachHallSignupCountdowns(rows.slice(0, 50)),
      orderEmptyHint,
    })
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
    const url = '/pages/register/register?edit=1'
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin(url)
      return
    }
    wx.navigateTo({ url })
  },
  goPrLogin() {
    guestRoutes.redirectToLogin('/pages/recommend/recommend')
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
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin('/pages/recommend/recommend')
      return
    }
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
      const sessionId = await chat.ensureSessionWithTalent(
        {
          id,
          talentMemberId: id === 'mock-preview' ? 'mock-preview' : id,
          name,
          avatar,
        },
        this.data.registryCache,
      )
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
