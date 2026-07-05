const auth = require('./auth.js')
const api = require('./api.js')
const registryCache = require('./registryCache.js')
const talentPlatformProfiles = require('./talentPlatformProfiles.js')
const { searchMpPrUsersLocal } = require('./prUserSearchLocal.js')
const prQuoteDimensions = require('./prQuoteDimensions.js')
const tierQuote = require('./mpRecruitmentTierQuote.js')

const PLATFORM_ALIASES = {
  抖音: 'douyin',
  小红书: 'xiaohongshu',
  快手: 'kuaishou',
  大众点评: 'dianping',
  微信视频号: 'weixin_video',
  半天: 'half_day',
  全天: 'full_day',
  单条剪辑: 'per_clip',
  单条: 'per_clip',
  half_day: 'half_day',
  full_day: 'full_day',
  per_clip: 'per_clip',
}

let cachedPrUsers = null

function normalizeQuotePlatform(raw) {
  const s = String(raw || '').trim()
  if (!s) return 'douyin'
  return PLATFORM_ALIASES[s] || PLATFORM_ALIASES[s.toLowerCase()] || s.toLowerCase()
}

function readMpPublishPrKeys(meta) {
  const m = meta && typeof meta === 'object' ? meta : {}
  return {
    prLingqiId: String(m.lingqiPrId || '').trim(),
    prRegistryId: String(m.registryPrId || '').trim(),
  }
}

/** 商单是否为「自报价」费用模式（专属价弹窗仅在此类商单展示） */
function isSelfQuoteRecruitmentOrder(orderMeta, mpOrder) {
  const meta = orderMeta && typeof orderMeta === 'object' ? orderMeta : {}
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'self_quote') return true
  if (feeTypeId === 'level_tier' || feeTypeId === 'fans_tier') {
    return tierQuote.orderMetaHasAnyTierSelfQuote(meta)
  }
  if (feeTypeId && feeTypeId !== 'self_quote') return false
  const budgetText = String((mpOrder && (mpOrder.budgetText || mpOrder.reward)) || '')
  return /自报价/.test(budgetText)
}

function resolveExclusiveQuoteYuan(quotes, opts) {
  const list = Array.isArray(quotes) ? quotes : []
  if (!list.length) return null
  const plat = normalizeQuotePlatform(opts.platform)
  const prLq = String(opts.prLingqiId || '').trim()
  const prReg = String(opts.prRegistryId || '').trim()
  for (let i = 0; i < list.length; i += 1) {
    const q = list[i]
    if (normalizeQuotePlatform(q.platform) !== plat) continue
    if (prLq && String(q.prLingqiId || '').trim() === prLq) return q.quoteYuan
    if (prReg && String(q.prRegistryId || '').trim() === prReg) return q.quoteYuan
  }
  return null
}

function getExclusiveQuoteOffer(member, platform, orderMeta, mpOrder) {
  if (!isSelfQuoteRecruitmentOrder(orderMeta, mpOrder)) return null
  const prKeys = readMpPublishPrKeys(orderMeta)
  const quoteYuan = resolveExclusiveQuoteYuan(member && member.prExclusiveQuotes, {
    ...prKeys,
    platform,
  })
  if (quoteYuan == null || quoteYuan <= 0) return null
  const meta = orderMeta && typeof orderMeta === 'object' ? orderMeta : {}
  const prLabel = String(meta.prDisplayName || prKeys.prLingqiId || '该 PR').trim()
  return { quoteYuan, prLabel }
}

function getExclusiveQuoteOfferForSupplier(member, orderMeta, workId, mpOrder) {
  if (workId !== 'shoot' && workId !== 'edit') return null
  if (!isSelfQuoteRecruitmentOrder(orderMeta, mpOrder)) return null
  const prKeys = readMpPublishPrKeys(orderMeta)
  const hit = prQuoteDimensions.resolveExclusiveQuoteYuanForSupplier(member && member.prExclusiveQuotes, {
    ...prKeys,
    workId,
  })
  if (!hit || hit.quoteYuan == null || hit.quoteYuan <= 0) return null
  const meta = orderMeta && typeof orderMeta === 'object' ? orderMeta : {}
  const prLabel = String(meta.prDisplayName || prKeys.prLingqiId || '该 PR').trim()
  const dim = String(hit.dimension || '').trim()
  return { quoteYuan: hit.quoteYuan, prLabel, dimension: dim }
}

function resolveDefaultApplyQuotePrice(member, platform) {
  const pid = talentPlatformProfiles.platformIdFromName(platform)
  const prof = member && member.platformProfiles && member.platformProfiles[pid]
  return String((prof && prof.quotePrice) || '').trim()
}

function resolveApplyQuotePrice(member, platform, orderMeta) {
  const exclusive = getExclusiveQuoteOffer(member, platform, orderMeta)
  if (exclusive) return String(exclusive.quoteYuan)
  return resolveDefaultApplyQuotePrice(member, platform)
}

function formatCooperationStatsLabel(stats) {
  if (!stats || stats.sampleCount <= 0) return ''
  const days = stats.windowDays || 30
  if (stats.sampleCount === 1) return `近${days}天合作价 ¥${stats.avgYuan}（1 单）`
  return `近${days}天 ¥${stats.minYuan}–¥${stats.maxYuan}（均 ¥${stats.avgYuan}，${stats.sampleCount} 单）`
}

function setPrUsersForSearch(users) {
  cachedPrUsers = Array.isArray(users) ? users : null
}

function readPrUsersForSearch() {
  if (Array.isArray(cachedPrUsers) && cachedPrUsers.length) return cachedPrUsers
  try {
    const entry = registryCache.load({ allowStale: true })
    const users = entry && entry.data && Array.isArray(entry.data.mpPrUsers) ? entry.data.mpPrUsers : []
    if (users.length) return users
  } catch (_) {}
  return []
}

function mergeSearchHits(local, remote) {
  const seen = new Set()
  const out = []
  for (const list of [local, remote]) {
    for (const row of list || []) {
      const key = String(row.lingqiPrId || row.id || '').trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(row)
    }
  }
  return out.slice(0, 12)
}

async function postPricing(path, body) {
  const headers = auth.authHeaders()
  return api.post(path, body, headers)
}

async function upsertTalentPrQuote(input) {
  const data = await postPricing('/api/meoo-ops-mp-talent-pr-quotes', { action: 'upsert', ...input })
  return Array.isArray(data.quotes) ? data.quotes : []
}

async function deleteTalentPrQuote(prLingqiId, platform) {
  const data = await postPricing('/api/meoo-ops-mp-talent-pr-quotes', {
    action: 'delete',
    prLingqiId,
    platform,
  })
  return Array.isArray(data.quotes) ? data.quotes : []
}

async function fetchTalentCooperationStats(talents, windowDays) {
  const data = await postPricing('/api/meoo-ops-mp-talent-cooperation-stats', {
    windowDays: windowDays || 30,
    talents: talents || [],
  })
  return data.stats && typeof data.stats === 'object' ? data.stats : {}
}

async function searchPrUsersRemote(query) {
  const q = String(query || '').trim()
  if (!q) return []
  const headers = auth.authHeaders()
  const path = `/api/meoo-ops-mp-pr-user-search?q=${encodeURIComponent(q)}`
  try {
    const data = await api.get(path, headers)
    return Array.isArray(data.results) ? data.results : []
  } catch (e) {
    const msg = String(e && e.message ? e.message : e)
    if (!/404|not_found|暂未|未更新/i.test(msg)) throw e
    return []
  }
}

async function searchPrUsers(query) {
  const q = String(query || '').trim()
  if (!q) return []
  const local = searchMpPrUsersLocal(readPrUsersForSearch(), q)
  let remote = []
  try {
    remote = await searchPrUsersRemote(q)
  } catch (_) {
    /* 网络/API 不可用时仅用本地 */
  }
  return mergeSearchHits(local, remote)
}

module.exports = {
  normalizeQuotePlatform,
  isSelfQuoteRecruitmentOrder,
  resolveDefaultApplyQuotePrice,
  getExclusiveQuoteOffer,
  getExclusiveQuoteOfferForSupplier,
  resolveApplyQuotePrice,
  formatCooperationStatsLabel,
  upsertTalentPrQuote,
  deleteTalentPrQuote,
  fetchTalentCooperationStats,
  searchPrUsers,
  setPrUsersForSearch,
  readPrUsersForSearch,
}
