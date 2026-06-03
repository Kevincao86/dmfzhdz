const api = require('./api.js')
const memberStore = require('./talentMember.js')
const applicationsStore = require('./applicationsStore.js')
const orderCard = require('./recruitmentOrderCard.js')

const TAG_CACHE_KEY = 'meoo_mp_ai_order_tags_v1'
const MATCH_CACHE_KEY = 'meoo_mp_ai_order_match_v1'
const PR_TALENT_MATCH_CACHE_KEY = 'meoo_mp_ai_pr_talent_match_v1'
const CACHE_TTL_MS = 6 * 3600 * 1000
const BATCH_SIZE = 8
const TALENT_BATCH_SIZE = 12

function readCache(key) {
  try {
    const raw = wx.getStorageSync(key)
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!j || typeof j !== 'object') return {}
    if (j.expiresAt && Date.now() > j.expiresAt) return {}
    return j.data && typeof j.data === 'object' ? j.data : {}
  } catch {
    return {}
  }
}

function writeCache(key, data) {
  try {
    wx.setStorageSync(
      key,
      JSON.stringify({
        expiresAt: Date.now() + CACHE_TTL_MS,
        data,
      }),
    )
  } catch {
    /* ignore */
  }
}

function hallKey(row) {
  if (row.isIce) return 'ice'
  if (row.urgent) return 'urgent'
  return 'normal'
}

function orderAiPayload(row) {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    region: row.region,
    category: row.category,
    budgetText: row.budgetText,
    fansRequirement: row.fansRequirement,
    hall: hallKey(row),
    urgent: !!row.urgent,
    isIce: !!row.isIce,
    summary: row.summary || '',
  }
}

function fallbackTagForRow(row, talentCity) {
  if (row.isMock) return { aiTag: '演示', aiTagTone: 'default' }
  if (row.isIce) return { aiTag: '云剪直派', aiTagTone: 'ice' }
  if (row.urgent) return { aiTag: '急单速报', aiTagTone: 'urgent' }
  const region = String(row.region || '')
  if (talentCity && region && region.includes(talentCity) && !region.includes('全国')) {
    return { aiTag: '同城优选', aiTagTone: 'match' }
  }
  if ((row.priceAmount || 0) >= 1000) return { aiTag: '高佣优选', aiTagTone: 'budget' }
  if (String(row.budgetText || '').includes('CPS')) return { aiTag: '佣金友好', aiTagTone: 'hot' }
  if (String(row.fansRequirement || '').includes('不限')) return { aiTag: '门槛低', aiTagTone: 'niche' }
  return { aiTag: '值得看看', aiTagTone: 'default' }
}

function applyTagMap(rows, map, talentCity) {
  return rows.map((row) => {
    const hit = map[row.id]
    if (hit && hit.tag) {
      return {
        ...row,
        aiTag: hit.tag,
        aiTagTone: hit.tone || 'default',
        aiTagSource: 'ai',
      }
    }
    const fb = fallbackTagForRow(row, talentCity)
    return { ...row, ...fb, aiTagSource: 'local' }
  })
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

async function postAi(body) {
  return api.post('/api/meoo-mp-recruitment-ai', body)
}

async function fetchTagItems(orders) {
  const map = {}
  for (const part of chunk(orders, BATCH_SIZE)) {
    try {
      const res = await postAi({ mode: 'tag', orders: part.map(orderAiPayload) })
      const items = res && Array.isArray(res.items) ? res.items : []
      for (const it of items) {
        if (it && it.id && it.tag) map[it.id] = { tag: it.tag, tone: it.tone || 'default' }
      }
    } catch {
      break
    }
  }
  return map
}

function talentProfileFromMember(member) {
  if (!member) return null
  const primary = memberStore.primaryPlatformProfile(member)
  const prof = (primary && primary.profile) || {}
  const city = String(member.city || '').trim()
  const province = String(member.province || '').trim()
  return {
    platform: (primary && primary.platform) || '',
    nickname: prof.platformNickname || member.wxNickName || '',
    followers: prof.followers || '',
    city,
    province,
    region: [province, city].filter(Boolean).join(' · '),
    accountTags: Array.isArray(prof.accountTags) ? prof.accountTags : [],
    douyinSalesLevel: prof.douyinSalesLevel || '',
    quotePrice: prof.quotePrice || '',
  }
}

function talentCacheSuffix(talent) {
  if (!talent) return 'guest'
  return [talent.platform, talent.nickname, talent.city, (talent.accountTags || []).join(',')]
    .join('|')
    .slice(0, 120)
}

async function fetchMatchItems(orders, talent) {
  const map = {}
  for (const part of chunk(orders, BATCH_SIZE)) {
    try {
      const res = await postAi({
        mode: 'match',
        orders: part.map(orderAiPayload),
        talent,
      })
      const items = res && Array.isArray(res.items) ? res.items : []
      for (const it of items) {
        if (!it || !it.id) continue
        map[it.id] = {
          score: Number(it.score) || 0,
          tag: it.tag || '',
          tone: it.tone || (Number(it.score) >= 75 ? 'match' : 'default'),
        }
      }
    } catch {
      break
    }
  }
  return map
}

function applyMatchMap(rows, map, talentCity) {
  return rows.map((row) => {
    const hit = map[row.id]
    const fb = fallbackTagForRow(row, talentCity)
    if (!hit) {
      return {
        ...row,
        ...fb,
        matchScore: row.matchScore || 0,
        aiTagSource: 'local',
      }
    }
    const score = Math.max(0, Math.min(100, Math.round(Number(hit.score) || 0)))
    return {
      ...row,
      matchScore: score,
      aiTag: hit.tag || (score >= 75 ? '高匹配' : fb.aiTag),
      aiTagTone: hit.tone || (score >= 75 ? 'match' : fb.aiTagTone),
      aiMatch: score >= 60,
      aiTagSource: 'ai',
    }
  })
}

async function enrichOrderTags(rows, opts) {
  const list = (rows || []).filter((r) => r && r.id)
  const talentCity = (opts && opts.talentCity) || ''
  const withLocal = applyTagMap(list, {}, talentCity)
  if (!api.hasApi() || !list.length) return withLocal

  const cache = readCache(TAG_CACHE_KEY)
  const missing = []
  const map = {}
  for (const row of list) {
    const ck = `${row.id}:${hallKey(row)}`
    if (cache[ck]) map[row.id] = cache[ck]
    else missing.push(row)
  }
  if (missing.length) {
    const fresh = await fetchTagItems(missing)
    for (const row of missing) {
      const ck = `${row.id}:${hallKey(row)}`
      if (fresh[row.id]) {
        map[row.id] = fresh[row.id]
        cache[ck] = fresh[row.id]
      }
    }
    writeCache(TAG_CACHE_KEY, cache)
  }
  return applyTagMap(list, map, talentCity)
}

async function enrichOrderMatches(rows, member) {
  const list = (rows || []).filter((r) => r && r.id && !r.isMock)
  const talent = talentProfileFromMember(member)
  const talentCity = talent && talent.city ? talent.city : ''
  if (!api.hasApi() || !list.length) {
    return applyMatchMap(list, {}, talentCity)
  }

  const suffix = talentCacheSuffix(talent)
  const cache = readCache(MATCH_CACHE_KEY)
  const bucket = cache[suffix] && typeof cache[suffix] === 'object' ? cache[suffix] : {}
  const missing = []
  const map = {}
  for (const row of list) {
    const ck = `${row.id}:${hallKey(row)}`
    if (bucket[ck]) map[row.id] = bucket[ck]
    else missing.push(row)
  }
  if (missing.length && talent) {
    const fresh = await fetchMatchItems(missing, talent)
    for (const row of missing) {
      const ck = `${row.id}:${hallKey(row)}`
      if (fresh[row.id]) {
        map[row.id] = fresh[row.id]
        bucket[ck] = fresh[row.id]
      }
    }
    cache[suffix] = bucket
    writeCache(MATCH_CACHE_KEY, cache)
  }

  const enriched = applyMatchMap(list, map, talentCity)
  enriched.sort((a, b) => {
    const d = (b.matchScore || 0) - (a.matchScore || 0)
    if (d !== 0) return d
    return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
  })
  return enriched
}

function prOrderAiPayload(mp, row) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const info = String(mp?.recruitmentInfo || mp?.merchantRequirements || '').slice(0, 500)
  return {
    ...orderAiPayload(row),
    talentTags: Array.isArray(meta.talentTags) ? meta.talentTags : [],
    infoSummary: info,
    recruitDetail: String(meta.recruitDetail || '').slice(0, 200),
  }
}

/** PR 本地发单 + 注册表，取最近开放中的招募单（最多 6 条） */
function resolvePrRecentOrders(reg) {
  const local = applicationsStore.readPublishedOrders()
  const mpList = Array.isArray(reg?.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const out = []
  for (const item of local) {
    if (!item || !item.mpOrderId) continue
    const mp = mpList.find((o) => o && o.id === item.mpOrderId)
    if (!mp) continue
    if (mp.status !== 'open' && mp.status !== 'collecting') continue
    const row = orderCard.mapMpOrderRow(mp, reg)
    out.push({ mp, row, payload: prOrderAiPayload(mp, row) })
    if (out.length >= 6) break
  }
  return out
}

function talentAiPayload(row) {
  return {
    id: row.id,
    platform: row.platform || '',
    nickname: row.name || '',
    followers: row.followersRaw != null ? row.followersRaw : row.followers,
    region: row.region || '',
    accountTags: row.accountTags || row.tags || [],
    douyinSalesLevel: row.douyinSalesLevel || row.salesGrade || '',
    gender: row.gender || '',
    quality: row.quality || '',
    tags: row.tags || [],
  }
}

function prOrdersCacheKey(orderPayloads) {
  return orderPayloads
    .map((p) => p.id)
    .join(',')
    .slice(0, 80)
}

function fallbackTalentScore(talent, orderPayloads) {
  if (!orderPayloads.length) return { score: 0, tag: '', tone: 'default' }
  let best = 0
  let tag = '可沟通'
  for (const o of orderPayloads) {
    let s = 40
    const plat = String(o.platform || '')
    const tPlat = String(talent.platform || '')
    if (plat && tPlat && plat === tPlat) s += 20
    const region = String(o.region || '')
    const tRegion = String(talent.region || '')
    if (region && tRegion && region.includes('全国')) s += 5
    else if (region && tRegion && tRegion && region.includes(tRegion.split('·')[0].trim())) s += 15
    const needTags = o.talentTags || []
    const tTags = talent.tags || talent.accountTags || []
    if (needTags.length && tTags.some((t) => needTags.includes(t))) s += 15
    const fansReq = String(o.fans || '')
    const f = Number(talent.followersRaw) || 0
    if (fansReq.includes('不限')) s += 10
    else {
      const fm = fansReq.match(/(\d+)/)
      if (fm && f >= Number(fm[1])) s += 12
    }
    if (s > best) {
      best = s
      if (s >= 70) tag = '较契合'
      else if (plat === tPlat) tag = '平台匹配'
    }
  }
  return { score: Math.min(88, best), tag, tone: best >= 65 ? 'match' : 'default' }
}

async function fetchPrTalentMatchItems(orderPayloads, talents) {
  const map = {}
  for (const part of chunk(talents, TALENT_BATCH_SIZE)) {
    try {
      const res = await postAi({
        mode: 'match_talent',
        orders: orderPayloads,
        talents: part.map(talentAiPayload),
      })
      const items = res && Array.isArray(res.items) ? res.items : []
      for (const it of items) {
        if (!it || !it.id) continue
        map[it.id] = {
          score: Number(it.score) || 0,
          tag: it.tag || '',
          tone: it.tone || (Number(it.score) >= 75 ? 'match' : 'default'),
        }
      }
    } catch {
      break
    }
  }
  return map
}

function applyTalentMatchMap(talents, map, orderPayloads) {
  return talents.map((t) => {
    if (t.isPreview) return { ...t, matchScore: 0, aiTag: '预览', aiTagTone: 'default' }
    const hit = map[t.id]
    const fb = fallbackTalentScore(t, orderPayloads)
    if (!hit) {
      return {
        ...t,
        matchScore: fb.score,
        aiTag: fb.tag,
        aiTagTone: fb.tone,
        aiMatch: fb.score >= 60,
        aiTagSource: 'local',
      }
    }
    const score = Math.max(0, Math.min(100, Math.round(Number(hit.score) || 0)))
    return {
      ...t,
      matchScore: score,
      aiTag: hit.tag || (score >= 75 ? '高匹配' : fb.tag),
      aiTagTone: hit.tone || (score >= 75 ? 'match' : fb.tone),
      aiMatch: score >= 55,
      aiTagSource: 'ai',
    }
  })
}

async function enrichTalentMatchesForPr(talents, reg) {
  const list = (talents || []).filter((t) => t && t.id && !t.isPreview)
  const packs = resolvePrRecentOrders(reg)
  const orderPayloads = packs.map((p) => p.payload)
  if (!orderPayloads.length) {
    return list.map((t) => ({
      ...t,
      matchScore: 0,
      aiTag: '',
      aiMatch: false,
      aiTagSource: 'none',
    }))
  }
  if (!api.hasApi() || !list.length) {
    return applyTalentMatchMap(list, {}, orderPayloads)
  }

  const cache = readCache(PR_TALENT_MATCH_CACHE_KEY)
  const oKey = prOrdersCacheKey(orderPayloads)
  const bucket = cache[oKey] && typeof cache[oKey] === 'object' ? cache[oKey] : {}
  const missing = []
  const map = {}
  for (const t of list) {
    if (bucket[t.id]) map[t.id] = bucket[t.id]
    else missing.push(t)
  }
  if (missing.length) {
    const fresh = await fetchPrTalentMatchItems(orderPayloads, missing)
    for (const t of missing) {
      if (fresh[t.id]) {
        map[t.id] = fresh[t.id]
        bucket[t.id] = fresh[t.id]
      }
    }
    cache[oKey] = bucket
    writeCache(PR_TALENT_MATCH_CACHE_KEY, cache)
  }

  const enriched = applyTalentMatchMap(list, map, orderPayloads)
  enriched.sort((a, b) => {
    const d = (b.matchScore || 0) - (a.matchScore || 0)
    if (d !== 0) return d
    return (b.followersRaw || 0) - (a.followersRaw || 0)
  })
  return enriched
}

module.exports = {
  enrichOrderTags,
  enrichOrderMatches,
  enrichTalentMatchesForPr,
  resolvePrRecentOrders,
  fallbackTagForRow,
  fallbackTalentScore,
  talentProfileFromMember,
}
