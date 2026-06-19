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
const orderFavorites = require('../../utils/orderFavorites.js')
const profileLinkUtil = require('../../utils/talentProfileLink.js')
const participant = require('../../utils/participant.js')
const { setTabBarForPage } = require('../../utils/tabBar.js')
const mpShare = require('../../utils/mpShare.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const hallCountdownTick = require('../../utils/hallCountdownTick.js')
const prFeatureAccess = require('../../utils/prFeatureAccess.js')
const sessionStore = require('../../utils/mpSessionStore.js')
const regionFilterPicker = require('../../utils/regionFilterPicker.js')

function buildPrHotTalentRows(rows, limit = 9) {
  const list = (rows || []).filter((r) => r && !r.isPreview)
  const sorted = list.slice().sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
  return sorted.slice(0, limit)
}

/** PR 顶部横滑：优先智能匹配结果，否则展示板块达人池 */
function resolvePrHotTalentRows(pool, displayRows, limit = 9) {
  const matched = buildPrHotTalentRows(displayRows, limit)
  if (matched.length) return matched
  const fallback = (pool || [])
    .filter((r) => r && !r.isPreview)
    .slice()
    .sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
  return buildPrHotTalentRows(fallback, limit)
}

function sortByMatchScoreDesc(rows, tieBreak) {
  return (rows || []).slice().sort((a, b) => {
    const d = (b.matchScore || 0) - (a.matchScore || 0)
    if (d !== 0) return d
    return tieBreak ? tieBreak(a, b) : 0
  })
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
  primaryTag: '美食探店',
  region: '上海',
  cityDisplay: '上海',
  gender: '女',
  genderSymbol: '♀',
  genderClass: 'f',
  online: true,
}

const PLATFORM_FILTERS = hallFilters.PLATFORM_FILTERS
const TAG_FILTERS = ['全部', '优质', '推荐', '新锐', '会员', '美食', '亲子', '美妆']
const GENDER_FILTERS = ['全部', '男', '女']
const STATUS_FILTERS = ['全部', '已沟通', '已收藏']
const ORDER_SEGMENTS = [
  { id: 'match', label: '智能匹配' },
  { id: 'quality', label: '优质推荐' },
  { id: 'hot', label: '热门全国' },
  { id: 'city', label: '同城急单' },
]

const CATEGORY_FILTERS = ['全部', '探店', '种草', '直播', '视频', '美食', '美妆', '家居', '数码']

function buildDisplayTags(row) {
  const tags = []
  const pushTag = (raw) => {
    const t = String(raw || '').trim()
    if (!t || t.length > 14 || /[\n\r；;]/.test(t)) return
    if (!tags.includes(t)) tags.push(t)
  }
  const cat = String((row && row.categoryTagsText) || '').trim()
  if (cat) {
    cat.split(/[、,，/]/).forEach(pushTag)
  }
  const talentTags = Array.isArray(row && row.talentTags) ? row.talentTags : []
  talentTags.forEach(pushTag)
  if (!tags.length && row && row.category) pushTag(row.category)
  return tags.slice(0, 2)
}

function truncateCardText(text, maxLen) {
  const t = String(text || '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}

function formatCardBudgetLine(row) {
  const bd = row && row.budgetDisplay
  if (bd && bd.kind === 'tiers') {
    return truncateCardText(bd.summary || bd.mode || '阶梯预算', 22)
  }
  if (bd && bd.line) return truncateCardText(bd.line, 22)
  return truncateCardText(row && row.budgetText, 22)
}

function formatRecommendCardRow(row) {
  const advantage =
    row.aiAdvantage ||
    (row.urgent
      ? '急单招募，报名响应快'
      : row.recommended
        ? '优质商单，合作价值较高'
        : (row.applicantCount || 0) >= 3
          ? `已有 ${row.applicantCount} 人关注，热度不错`
          : '')
  return {
    ...row,
    cardTitle: truncateCardText(row.title, 40),
    cardBudgetLine: formatCardBudgetLine(row),
    cardFansLine: truncateCardText(
      row.fansRequirement && row.fansRequirement !== '不限'
        ? `粉丝：${row.fansRequirement}`
        : `${row.platform || '平台'} · 见详情`,
      24,
    ),
    displayTags: buildDisplayTags(row),
    cardAdvantage: advantage,
  }
}

function buildSpotlightTag(row) {
  const tags = buildDisplayTags(row)
  return tags[0] || String((row && row.category) || '本地生活').trim()
}

function matchCategoryFilter(row, filterCategory) {
  if (!filterCategory || filterCategory === '全部') return true
  const blob = [
    row.title,
    row.category,
    row.categoryTagsText,
    ...(row.talentTags || []),
  ]
    .join(' ')
  return blob.includes(filterCategory)
}

function pickSpotlightBatch(pool, offset, size) {
  const list = pool || []
  if (!list.length) return []
  const n = list.length
  const start = ((Number(offset) || 0) % n + n) % n
  const out = []
  for (let i = 0; i < size; i += 1) out.push(list[(start + i) % n])
  return out
}

/** 标题下横滑区：同城急单优先，其次热门全国 */
function buildHotCityStripPool(rows, talentCity) {
  const cityUrgent = []
  const cityOther = []
  const hotNation = []
  for (const r of rows || []) {
    if (!r || r.isMock) continue
    const city = talentCity && matchOrderSegment(r, 'city', talentCity)
    const urgent = !!r.urgent
    const hot =
      urgent ||
      !!r.recommended ||
      (r.applicantCount || 0) >= 3 ||
      (r.priceAmount || 0) >= 1000
    if (city && urgent) {
      cityUrgent.push({ ...r, stripKind: 'city', stripLabel: '同城急单' })
    } else if (city) {
      cityOther.push({ ...r, stripKind: 'city', stripLabel: '同城急单' })
    } else if (hot) {
      hotNation.push({ ...r, stripKind: 'hot', stripLabel: '热门全国' })
    }
  }
  hotNation.sort((a, b) => {
    const h = (b.applicantCount || 0) - (a.applicantCount || 0)
    if (h !== 0) return h
    return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
  })
  const seen = new Set()
  const merged = [...cityUrgent, ...cityOther, ...hotNation].filter((r) => {
    if (!r.id || seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
  if (merged.length) return merged
  return (rows || [])
    .filter((r) => r && r.id)
    .slice()
    .sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
    .slice(0, 12)
    .map((r) => {
      const city = talentCity && matchOrderSegment(r, 'city', talentCity)
      return {
        ...r,
        stripKind: city ? 'city' : 'hot',
        stripLabel: city ? '同城急单' : '热门全国',
      }
    })
}

function resolveStripPresentation(enriched, talentCity, hasProfile, identity) {
  const rows = enriched || []
  const id = String(identity || 'talent').trim()
  const isSupplier = id === 'shoot' || id === 'edit'
  const supplierLabel = id === 'shoot' ? '拍摄团队' : id === 'edit' ? '剪辑团队' : ''
  const aiPool = rows
    .filter((r) => (r.matchScore || 0) > 0)
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
  const hotCityPool = buildHotCityStripPool(rows, talentCity)
  if (!isSupplier && hasProfile && aiPool.length) {
    return {
      mode: 'ai',
      title: '为您智能匹配',
      sub: '基于您的技能、偏好和行为数据',
      pool: aiPool,
    }
  }
  if (hotCityPool.length) {
    return {
      mode: 'hotcity',
      title: isSupplier ? '推荐商单' : '热门 · 同城急单',
      sub: isSupplier
        ? `为您推荐${supplierLabel}可接招募单，左右滑动查看更多`
        : talentCity
          ? `全国热门与「${talentCity}」同城商单推荐`
          : '全国热门招募推荐，完善资料后享 AI 智能匹配',
      pool: hotCityPool,
    }
  }
  if (rows.length) {
    return {
      mode: isSupplier ? 'hotcity' : 'ai',
      title: isSupplier ? '推荐商单' : '为您智能匹配',
      sub: isSupplier
        ? `为您推荐${supplierLabel}可接招募单`
        : '基于您的技能、偏好和行为数据',
      pool: rows.slice(0, 12),
    }
  }
  return {
    mode: 'empty',
    title: isSupplier ? '推荐商单' : '为您智能匹配',
    sub: isSupplier ? `暂无${supplierLabel}可接商单` : '暂无招募商单',
    pool: [],
  }
}

function applyStripBatch(page, presentation, offsetOverride) {
  const pool = presentation.pool || []
  const offset =
    offsetOverride !== undefined ? offsetOverride : Number(page.data.spotlightOffset) || 0
  const batch = pickSpotlightBatch(pool, offset, 3).map((r) => ({
    ...r,
    cardTitle: truncateCardText(r.title, 28),
    spotlightTag:
      presentation.mode === 'ai' ? buildSpotlightTag(r) : r.stripLabel || buildSpotlightTag(r),
  }))
  const dotCount = Math.max(1, Math.min(5, Math.ceil(pool.length / 3) || 1))
  const spotlightDots = Array.from({ length: dotCount }, (_, i) => i)
  const spotlightDotIndex = dotCount > 0 ? Math.floor(offset / 3) % dotCount : 0
  page._stripPool = pool
  page.setData({
    stripMode: presentation.mode,
    stripTitle: presentation.title,
    stripSub: presentation.sub,
    showStripPanel: !page.data.isPrMode,
    spotlightRows: batch,
    spotlightDots,
    spotlightDotIndex,
    spotlightOffset: offset,
  })
}

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
      profileLink: p.profileLink || '',
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

function genderUi(gender) {
  const g = String(gender || '不限')
  if (g === '女') return { genderSymbol: '♀', genderClass: 'f' }
  if (g === '男') return { genderSymbol: '♂', genderClass: 'm' }
  return { genderSymbol: '', genderClass: '' }
}

function formatTalent(row) {
  const followersRaw = Number(row.followers) || 0
  const platform = row.platform || '抖音'
  const tags = []
  if (row.qualityTag) tags.push(row.qualityTag)
  if (row.niche && row.niche !== '本地生活') tags.push(String(row.niche).slice(0, 8))
  const accountTags = Array.isArray(row.accountTags) ? row.accountTags : []
  const tagList = tags.length ? tags : ['本地生活']
  const cityDisplay = row.city || (row.region ? String(row.region).split(' · ').pop() : '')
  const profileHref = profileLinkUtil.resolveTalentProfileHref(platform, row.profileLink)
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
    tags: tagList,
    primaryTag: tagList[0] || '',
    accountTags,
    region: [row.province, row.city].filter(Boolean).join(' · ') || row.region || '',
    cityDisplay,
    gender: row.gender || '不限',
    ...genderUi(row.gender),
    online: row.online !== false,
    matchScore: 0,
    aiTag: '',
    aiTagTone: 'default',
    aiMatch: false,
    profileHref,
    profileLink: row.profileLink || '',
    hasProfileLink: !!profileHref,
    profileLinkLabel: profileHref ? profileLinkUtil.shortProfileLinkButtonLabel(platform) : '',
  }
}

function matchTalentFilters(row, f) {
  if (!hallFilters.matchPlatform(row.platform, f.platform)) return false
  if (!hallFilters.matchRegionFilter(row.region, '', f.province, f.city)) return false
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

/** 智能匹配结果缓存键：board + 匹配招募单 + Eligible 发单 ID 列表（新发单后自动失效） */
function buildPrTalentMatchCacheKey(board, matchOrderId, reg) {
  if (!reg) return ''
  const packs = recruitmentAi.listPrEligibleOrders(reg, { board })
  const ids = packs
    .map((p) => String((p.row && p.row.id) || '').trim())
    .filter(Boolean)
    .sort()
    .join('|')
  const mid = String(matchOrderId || prMatchOrderSelect.PR_MATCH_RECENT).trim()
  return `${board}::${mid}::${ids}`
}

function fallbackTalentScores(talents, reg, board, matchOrderId) {
  const packs = recruitmentAi.resolvePrMatchOrders(reg, { board, mpOrderId: matchOrderId })
  const payloads = packs.map((p) => p.payload)
  return (talents || []).map((t) => {
    const fb = recruitmentAi.fallbackTalentScore(t, payloads, board)
    return {
      ...t,
      matchScore: fb.score,
      aiTag: fb.tag,
      aiTagTone: fb.tone,
      aiMatch: fb.score >= 55,
    }
  })
}

/** 仅 cache miss / 新发单 / 切换匹配招募单时调用 AI；其余筛选项在缓存结果上本地过滤 */
async function ensurePrTalentScoredPool(page, pool, board, matchOrderId, reg) {
  const list = (pool || []).filter((t) => t && t.id && !t.isPreview)
  const key = buildPrTalentMatchCacheKey(board, matchOrderId, reg)
  if (
    key &&
    page._prTalentScoredCache &&
    page._prTalentScoredCache.key === key &&
    Array.isArray(page._prTalentScoredCache.rows)
  ) {
    return page._prTalentScoredCache.rows
  }
  let scored = list
  if (reg && list.length) {
    wx.showLoading({ title: '智能匹配中…', mask: false })
    try {
      try {
        scored = await recruitmentAi.enrichTalentMatchesForPr(list, reg, {
          board,
          mpOrderId: matchOrderId,
        })
      } catch (_) {
        scored = fallbackTalentScores(list, reg, board, matchOrderId)
      }
      scored = sortByMatchScoreDesc(scored, (a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
      scored = scored.filter((t) => (t.matchScore || 0) >= 60)
      scored = sortByMatchScoreDesc(scored, (a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
    } finally {
      wx.hideLoading()
    }
  }
  if (key) page._prTalentScoredCache = { key, rows: scored }
  return scored
}

Page({
  behaviors: [require('../../behaviors/identityTheme')],
  data: {
    recHeadBandStyle: '',
    recHeadInnerStyle: '',
    identity: 'talent',
    isPrMode: false,
    prRecommendLocked: false,
    talentTestMode: false,
    talentTestHint: '',
    searchKeyword: '',
    loading: true,
    err: '',
    allRows: [],
    displayRows: [],
    listEmptyHint: '',
    filterPlatform: '全部',
    filterProvince: '全部',
    filterCity: '全部',
    regionFilterLabel: '地区',
    regionMultiRange: [['全部'], ['全部']],
    regionMultiValue: [0, 0],
    filterCategory: '全部',
    categoryFilters: CATEGORY_FILTERS,
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
    priceFilterLabel: '预算',
    allFiltersDefault: true,
    spotlightOffset: 0,
    spotlightDotIndex: 0,
    spotlightDots: [0],
    showPriceSheet: false,
    priceBuckets: hallFilters.priceBucketsForView([]),
    allOrderRows: [],
    orderDisplayRows: [],
    spotlightRows: [],
    stripMode: 'hotcity',
    stripTitle: '热门 · 同城急单',
    stripSub: '',
    showStripPanel: false,
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
    prHotTalentRows: [],
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
    const regionState = regionFilterPicker.initRegionFilterState('全部', '全部')
    regionState.regionFilterLabel = '地区'
    this.setData(regionState)
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
    try {
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
          await require('../../utils/registryProfileSync.js').pullRegistryProfileAfterLogin()
        } catch (_) {}
        try {
          await require('../../utils/mpAccountClientSync.js').pullAfterLogin()
        } catch (_) {}
      }
      const account = sessionStore.readAccount()
      const prRecommendLocked =
        isPr && !talentTestMode && !prFeatureAccess.canUsePrRecommendHall(account)
      this.setData({ prRecommendLocked })
      if (!isPrMode) hallCountdownTick.startHallCountdownTick(this, 'orderDisplayRows')
      else hallCountdownTick.stopHallCountdownTick(this)
      if (isPrMode && !prRecommendLocked) this.loadTalentList()
      else if (!isPrMode) this.loadOrderList()
      else if (prRecommendLocked) {
        this.setData({ loading: false, err: '', allRows: [], displayRows: [] })
      }
    } catch (e) {
      console.error('[recommend] onShow', e)
      this.setData({
        loading: false,
        err: String((e && e.message) || e || '页面初始化失败，请重新编译'),
      })
    }
  },
  onHide() {
    hallCountdownTick.stopHallCountdownTick(this)
  },
  onUnload() {
    hallCountdownTick.stopHallCountdownTick(this)
  },
  async loadTalentList() {
    if (this.data.prRecommendLocked) {
      this.setData({ loading: false, err: '', allRows: [], displayRows: [] })
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
      this._stripCacheKey = ''
      this._stripEnriched = null
      this.safeApplyOrderFilters()
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
      this._stripCacheKey = ''
      this._stripEnriched = null
      this.safeApplyOrderFilters()
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e.message || e),
        allOrderRows: allowDemo ? mocks : [],
      })
      this.safeApplyOrderFilters()
    }
  },
  safeApplyOrderFilters() {
    const p = this.applyOrderFilters()
    if (p && typeof p.catch === 'function') {
      p.catch((e) => {
        console.error('[recommend] applyOrderFilters', e)
        this.setData({
          loading: false,
          err: String((e && e.message) || e || '筛选失败'),
        })
      })
    }
  },
  async applyTalentFilters() {
    const board = this.data.prBoard || 'talent'
    const pool =
      (this._boardPools && this._boardPools[board]) || this.data.allRows || []
    const f = {
      platform: this.data.filterPlatform,
      province: this.data.filterProvince,
      city: this.data.filterCity,
      tag: this.data.filterTag,
      gender: this.data.filterGender,
    }
    const kw = String(this.data.searchKeyword || '').trim()
    const filterOne = (r) => matchTalentFilters(r, f) && matchTalentSearch(r, kw)

    const token = Date.now()
    this._talentFilterToken = token

    if (this.data.prViewMode === 'all') {
      let filtered = pool.filter(filterOne)
      filtered = filtered.slice().sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
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
      this.setData({ displayRows, listEmptyHint, prHotTalentRows: resolvePrHotTalentRows(pool, displayRows) })
      return
    }

    const matchOrderId = this.data.prMatchOrderId || prMatchOrderSelect.PR_MATCH_RECENT
    const hasMatchOrders =
      matchOrderId !== prMatchOrderSelect.PR_MATCH_RECENT
        ? (this.data.prMatchOrderOptions || []).some((o) => o.id === matchOrderId)
        : this.data.prBoardOrderCount > 0

    if (!hasMatchOrders) {
      if (this._talentFilterToken !== token) return
      const hotPool = this._boardPools && this._boardPools[board]
      this.setData({
        displayRows: [],
        listEmptyHint: prBoard.smartMatchNeedRecruitHint(board),
        prHotTalentRows: resolvePrHotTalentRows(hotPool, []),
      })
      return
    }

    let filtered = []
    if (hasMatchOrders && this.data.registryCache && pool.length) {
      const scoredPool = await ensurePrTalentScoredPool(
        this,
        pool,
        board,
        matchOrderId,
        this.data.registryCache,
      )
      if (this._talentFilterToken !== token) return
      filtered = scoredPool.filter(filterOne)
    } else {
      filtered = []
    }

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
    this.setData({
      displayRows,
      listEmptyHint,
      prHotTalentRows: resolvePrHotTalentRows(pool, displayRows),
    })
  },
  onPrBoard(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.prBoard) return
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
    const board = this.data.prBoard || 'talent'
    const idx = Math.max(0, opts.findIndex((o) => o.id === hit.id))
    prMatchOrderSelect.writePrMatchOrderId(board, hit.id)
    this.setData({
      showPrMatchOrderSheet: false,
      prMatchOrderKeyword: '',
      prMatchOrderId: hit.id,
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
    this.setData({ prViewMode: mode })
    this.applyTalentFilters()
  },
  async ensureStripEnriched() {
    if (this.data.isPrMode) return []
    const identity = this.data.identity || userProfile.readIdentity()
    const talentCity = this.data.talentCity || readTalentCity()
    const member = memberStore.readMember()
    const eligible = (this.data.allOrderRows || []).filter(
      (r) =>
        r &&
        recommendHall.orderMatchesRecommendHallIdentity(r, identity) &&
        recommendHall.isRecommendHallRecruitingStatus(r),
    )
    const cacheKey = eligible
      .map((r) => r.id)
      .sort()
      .join('|')
    if (this._stripCacheKey === cacheKey && Array.isArray(this._stripEnriched)) {
      return this._stripEnriched
    }
    let rows = eligible.filter((r) => !r.isMock)
    if (!rows.length) rows = eligible
    if (rows.length) {
      const sample = rows.slice(0, 40)
      try {
        if (api.hasApi() && memberStore.hasFilledPlatform(member)) {
          rows = await recruitmentAi.enrichOrderMatches(sample, member, {
            workIdentity: identity,
          })
        } else {
          rows = await recruitmentAi.enrichOrderTags(sample, { talentCity })
        }
      } catch (_) {
        rows = sample
      }
    }
    this._stripCacheKey = cacheKey
    this._stripEnriched = rows
    return rows
  },
  async commitScrollStrip(offsetOverride) {
    if (this.data.isPrMode) return
    const talentCity = this.data.talentCity || readTalentCity()
    const member = memberStore.readMember()
    const hasProfile = memberStore.hasFilledPlatform(member)
    const enriched = await this.ensureStripEnriched()
    const presentation = resolveStripPresentation(
      enriched,
      talentCity,
      hasProfile,
      this.data.identity || userProfile.readIdentity(),
    )
    applyStripBatch(this, presentation, offsetOverride)
  },
  async applyOrderFilters() {
    const token = Date.now()
    this._orderFilterToken = token
    const segment = this.data.orderSegment
    const talentCity = this.data.talentCity
    const identity = this.data.identity || userProfile.readIdentity()
    const member = memberStore.readMember()
    if (segment === 'match' && identity === 'talent' && !memberStore.hasFilledPlatform(member)) {
      await this.commitScrollStrip(0)
      this.setData({
        orderDisplayRows: [],
        orderEmptyHint: '请补充平台资料，以便AI匹配商单',
        allFiltersDefault:
          this.data.filterPlatform === '全部' &&
          this.data.filterProvince === '全部' &&
          this.data.filterCity === '全部' &&
          this.data.filterCategory === '全部' &&
          !(this.data.priceSelected && this.data.priceSelected.length),
      })
      return
    }
    const kw = String(this.data.searchKeyword || '').trim()
    const pf = this.data.filterPlatform
    const provf = this.data.filterProvince
    const cf = this.data.filterCity
    const catf = this.data.filterCategory
    const priceSel = this.data.priceSelected
    let rows = (this.data.allOrderRows || []).filter((r) => {
      if (!recommendHall.orderMatchesRecommendHallIdentity(r, identity)) return false
      if (!recommendHall.isRecommendHallRecruitingStatus(r)) return false
      if (!matchOrderSearch(r, kw)) return false
      if (!hallFilters.matchPlatform(r.platform, pf)) return false
      if (!hallFilters.matchRegionFilter(r.region, r.storeName, provf, cf)) return false
      if (!matchCategoryFilter(r, catf)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSel)) return false
      if (!matchOrderSegment(r, segment, talentCity)) return false
      return true
    })
    let real = rows.filter((r) => r && !r.isMock)
    const mocks = showDemoOrders() ? rows.filter((r) => r && r.isMock) : []
    if (segment === 'match' && real.length) {
      const preMatched = real.filter((r) => (r.matchScore || 0) >= 40 || r.aiMatch)
      real = preMatched.length ? preMatched : real
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
    const favSet = orderFavorites.readIdSet()
    const buildDisplay = (list) =>
      listFilters.attachHallSignupCountdowns(
        list.slice(0, 50).map((r) => ({
          ...formatRecommendCardRow(r),
          favorited: favSet.has(String(r.id)),
        })),
      )
    const allFiltersDefault =
      pf === '全部' &&
      provf === '全部' &&
      cf === '全部' &&
      catf === '全部' &&
      !(priceSel && priceSel.length)
    if (this._orderFilterToken !== token) return
    this.setData({
      orderDisplayRows: buildDisplay(rows),
      orderEmptyHint,
      allFiltersDefault,
    })

    if (!real.length) {
      await this.commitScrollStrip(this.data.spotlightOffset || 0)
      return
    }
    try {
      let enriched = real
      if (api.hasApi()) {
        enriched = await recruitmentAi.enrichOrderMatches(real, member, { workIdentity: identity })
      } else {
        enriched = await recruitmentAi.enrichOrderTags(real, { talentCity })
        enriched = enriched.map((r) => ({
          ...r,
          matchScore: 0,
          aiMatch: false,
          aiAdvantage: recruitmentAi.fallbackOrderAdvantage(r, null, talentCity),
        }))
      }
      if (this._orderFilterToken !== token) return
      if (segment === 'match' && enriched.length) {
        const matched = enriched.filter((r) => (r.matchScore || 0) >= 40 || r.aiMatch)
        enriched = matched.length ? matched : enriched
      }
      enriched = sortByMatchScoreDesc(enriched, (a, b) => {
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
      this.setData({
        orderDisplayRows: buildDisplay([...enriched, ...mocks]),
      })
    } catch (e) {
      console.error('[recommend] enrichOrderMatches', e)
    }
    await this.commitScrollStrip(this.data.spotlightOffset || 0)
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
      next.regionFilterLabel = '地区'
    }
    this.setData(next)
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
      priceFilterLabel: hallFilters.priceFilterLabel(priceSelected, '预算'),
    })
    this.applyOrderFilters()
  },
  onCategoryFilter(e) {
    this.setData({
      filterCategory: this.data.categoryFilters[Number(e.detail.value)] || '全部',
    })
    this.applyOrderFilters()
  },
  onResetAllFilters() {
    const regionState = regionFilterPicker.initRegionFilterState('全部', '全部')
    regionState.regionFilterLabel = '地区'
    this.setData({
      ...regionState,
      filterPlatform: '全部',
      filterCategory: '全部',
      priceSelected: [],
      priceFilterLabel: '预算',
      priceBuckets: hallFilters.priceBucketsForView([]),
      spotlightOffset: 0,
    })
    this.applyOrderFilters()
  },
  onOpenFilterSheet() {
    this.setData({
      showPriceSheet: true,
      priceBuckets: hallFilters.priceBucketsForView(this.data.priceSelected),
    })
  },
  onSpotlightRefresh() {
    const pool = this._stripPool || []
    if (pool.length <= 1) {
      wx.showToast({ title: '暂无更多推荐', icon: 'none' })
      return
    }
    const nextOffset = (Number(this.data.spotlightOffset) || 0) + 3
    const talentCity = this.data.talentCity || readTalentCity()
    const member = memberStore.readMember()
    const hasProfile = memberStore.hasFilledPlatform(member)
    const presentation = resolveStripPresentation(
      this._stripEnriched || pool,
      talentCity,
      hasProfile,
      this.data.identity || userProfile.readIdentity(),
    )
    applyStripBatch(this, presentation, nextOffset)
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
  onProfileTap(e) {
    const id = e.currentTarget.dataset.id
    const row = (this.data.displayRows || []).find((r) => r && r.id === id)
    if (!row || !row.hasProfileLink) {
      wx.showToast({ title: '暂无平台主页链接', icon: 'none' })
      return
    }
    profileLinkUtil.openTalentProfileLink(row.profileHref || row.profileLink)
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
    const board = this.data.prBoard || 'talent'
    const pool = (this._boardPools && this._boardPools[board]) || this.data.allRows || []
    this.setData({
      displayRows,
      prHotTalentRows: resolvePrHotTalentRows(pool, displayRows),
    })
    wx.showToast({
      title: favorited ? '已收藏' : '已取消收藏',
      icon: 'none',
      duration: 1200,
    })
  },
  onToggleOrderFavorite(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === 'mock-preview') return
    const favorited = orderFavorites.toggleFavorite(id)
    const orderDisplayRows = (this.data.orderDisplayRows || []).map((r) =>
      r && r.id === id ? { ...r, favorited } : r,
    )
    this.setData({ orderDisplayRows })
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
