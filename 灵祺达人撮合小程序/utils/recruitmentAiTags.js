const api = require('./api.js')
const auth = require('./auth.js')
const memberStore = require('./talentMember.js')
const applicationsStore = require('./applicationsStore.js')
const orderCard = require('./recruitmentOrderCard.js')
const participant = require('./participant.js')
const { isIceMpOrder } = require('./recruitmentUrgent.js')
const userProfile = require('./userProfile.js')
const identityTypes = require('./identityTypes.js')
const orderHighlightTag = require('./orderHighlightTag.js')

const TAG_CACHE_KEY = 'meoo_mp_ai_order_tags_v2'
const MATCH_CACHE_KEY = 'meoo_mp_ai_order_match_v3'
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
  return orderHighlightTag.enrichOrderAiPayload({
    id: row.id,
    title: row.title,
    platform: row.platform,
    region: row.region,
    category: row.category,
    categoryTagsText: row.categoryTagsText,
    budgetText: row.budgetText,
    budgetDisplay: row.budgetDisplay,
    fansRequirement: row.fansRequirement,
    recruitTarget: row.recruitTarget || 'talent',
    hall: hallKey(row),
    urgent: !!row.urgent,
    isIce: !!row.isIce,
    isMock: !!row.isMock,
    summary: row.summary || '',
    priceAmount: row.priceAmount || 0,
  })
}

function talentMatchCacheKey(talent) {
  if (!talent) return 'guest'
  return [
    String(talent.id || '').trim(),
    talent.workIdentity || talent.role || 'talent',
    talent.platform || '',
    talent.city || '',
    talent.province || '',
    String(talent.followers ?? ''),
    talent.douyinSalesLevel || '',
    talent.quotePrice || '',
    (talent.accountTags || []).slice(0, 8).join(','),
  ]
    .join('|')
    .slice(0, 200)
}

function orderLocationText(order) {
  return [order.region, order.title, order.summary, order.category].filter(Boolean).join(' · ')
}

function regionMatchesTalent(region, city, province, extraContext) {
  const r = [String(region || '').trim(), String(extraContext || '').trim()].filter(Boolean).join(' · ')
  if (!r) return 'unknown'
  if (r.includes('全国')) return 'national'
  const c = String(city || '').trim()
  const p = String(province || '').trim()
  const cShort = c.replace(/市$/, '')
  const pShort = p.replace(/省$/, '').replace(/市$/, '')
  if (c && (r.includes(c) || (cShort.length >= 2 && r.includes(cShort)))) return 'same_city'
  if (pShort.length >= 2 && r.includes(pShort)) return 'same_province'
  if (c || p) return 'mismatch'
  return 'unknown'
}

function fansRequirementMet(fansReq, followers) {
  const req = String(fansReq || '').trim()
  if (!req || /不限|档位|按招募|按云剪|协商/.test(req)) return true
  const f = Number(followers) || 0
  const fm = req.match(/([\d.]+)\s*万/)
  const need = fm ? Number(fm[1]) * 10000 : Number((req.match(/(\d+)/) || [])[1] || 0)
  if (need <= 0 || f <= 0) return true
  return f >= need * 0.85
}

function tagsOrCategoryAlign(order, talent) {
  const cat = String(order.category || '').trim()
  const blob = orderLocationText(order)
  const tags = [...(talent.accountTags || []), ...(talent.tags || []), ...(talent.supplierSkills || [])].filter(Boolean)
  if (cat && tags.some((t) => cat.includes(t) || t.includes(cat))) return true
  if (tags.some((t) => t.length >= 2 && blob.includes(t))) return true
  return false
}

function salesLevelAligns(order, talent) {
  const level = String(talent.douyinSalesLevel || '').trim()
  if (!level) return true
  const blob = orderLocationText(order) + String(order.fansRequirement || '')
  if (/不限|档位|按招募/.test(blob)) return true
  return true
}

function strongMatchScoreFloor(facts) {
  if (!facts.recruitTargetOk || !facts.platformOk) return 0
  if (facts.region === 'mismatch') return 0
  let floor =
    facts.region === 'same_city' ? 78 : facts.region === 'same_province' ? 62 : facts.region === 'national' ? 55 : facts.region === 'unknown' ? 50 : 0
  if (facts.fansOk) floor += 6
  if (facts.tagsOk) floor += 8
  if (facts.levelOk) floor += 4
  if (facts.region === 'same_city' && facts.platformOk && facts.fansOk && (facts.tagsOk || facts.levelOk)) {
    floor = Math.max(floor, 88)
  } else if (facts.region === 'same_city' && facts.platformOk && facts.fansOk) {
    floor = Math.max(floor, 80)
  }
  return Math.min(95, floor)
}

function analyzeMatchFacts(order, talent) {
  const loc = regionMatchesTalent(order.region || '', talent.city || '', talent.province || '', orderLocationText(order))
  const plat = String(order.platform || '')
  const tPlat = String(talent.platform || '')
  return {
    recruitTargetOk: recruitTargetMatchesOrder(order, talent),
    platformOk: !plat || !tPlat || plat === tPlat,
    region: loc,
    fansOk: fansRequirementMet(String(order.fansRequirement || ''), Number(talent.followers) || 0),
    tagsOk: tagsOrCategoryAlign(order, talent),
    levelOk: salesLevelAligns(order, talent),
  }
}

function recruitTargetMatchesOrder(order, talent) {
  const target = String(order.recruitTarget || 'talent')
  const wid = String(talent.workIdentity || talent.role || 'talent')
  if (target === wid) return true
  if (target === 'edit' && order.isIce && wid === 'edit') return true
  return false
}

function clampMatchScoreByFacts(score, order, talent) {
  let s = Number(score)
  if (!Number.isFinite(s)) s = 0
  const facts = analyzeMatchFacts(order, talent)
  if (!facts.recruitTargetOk) return Math.max(0, Math.min(100, Math.round(Math.min(s, 28))))
  if (!facts.platformOk) s = Math.min(s, 42)
  if (facts.region === 'mismatch') s = Math.min(s, 48)
  else if (facts.region === 'unknown' && !String(order.region || '').includes('全国')) s = Math.min(s, 58)
  if (!facts.fansOk) s = Math.min(s, 44)
  const floor = strongMatchScoreFloor(facts)
  if (floor > 0) s = Math.max(s, floor)
  return Math.max(0, Math.min(100, Math.round(s)))
}

function fallbackOrderMatchScore(order, talent) {
  if (!recruitTargetMatchesOrder(order, talent)) {
    return { score: 18, tag: '身份不符', tone: 'default' }
  }
  let s = 10
  const plat = String(order.platform || '')
  const tPlat = String(talent.platform || '')
  if (plat && tPlat && plat === tPlat) s += 14
  else if (plat && tPlat) s -= 6
  const loc = regionMatchesTalent(order.region || '', talent.city || '', talent.province || '', orderLocationText(order))
  if (loc === 'same_city') s += 28
  else if (loc === 'same_province') s += 14
  else if (loc === 'national') s += 8
  else if (loc === 'mismatch') s -= 10
  if (tagsOrCategoryAlign(order, talent)) s += 14
  if (salesLevelAligns(order, talent)) s += 6
  const f = Number(talent.followers) || 0
  if (fansRequirementMet(String(order.fansRequirement || ''), f)) s += 10
  else if (f > 0) s -= 10
  const cat = String(order.category || '')
  const habits = talent.applicationHabits || {}
  if (habits.preferredPlatforms && habits.preferredPlatforms.includes(plat)) s += 3
  if (cat && habits.preferredCategories && habits.preferredCategories.some((c) => cat.includes(c) || c.includes(cat))) s += 2
  if (order.urgent && (habits.urgentApplyRatio || 0) > 25) s += 2
  const score = clampMatchScoreByFacts(s, order, talent)
  let tag = '可看看'
  if (score >= 72) tag = '高匹配'
  else if (score >= 58) tag = '较契合'
  else if (loc === 'same_city') tag = '同城'
  else if (plat && tPlat && plat === tPlat) tag = '平台匹配'
  else if (loc === 'mismatch') tag = '异地'
  return { score, tag, tone: score >= 58 ? 'match' : 'default' }
}

function applyOrderMatchResults(rows, map, talent, talentCity) {
  const profile = { ...talent, city: talent.city || talentCity }
  return rows.map((row) => {
    const hit = map[row.id]
    if (hit && hit.score > 0) {
      const score = clampMatchScoreByFacts(hit.score, row, profile)
      return {
        ...row,
        matchScore: score,
        aiTag: hit.tag || (score >= 72 ? '高匹配' : ''),
        aiTagTone: hit.tone || (score >= 72 ? 'match' : 'default'),
        aiMatch: score >= 58,
        aiTagSource: 'ai',
      }
    }
    const fb = fallbackOrderMatchScore(row, profile)
    return {
      ...row,
      matchScore: fb.score,
      aiTag: fb.tag,
      aiTagTone: fb.tone,
      aiMatch: fb.score >= 55,
      aiTagSource: 'local',
    }
  })
}

function applicationHabitsFromStore() {
  const apps = applicationsStore.readApplications().slice(0, 40)
  const platforms = {}
  const regions = {}
  const categories = {}
  let iceCount = 0
  let urgentCount = 0
  for (const a of apps) {
    const p = String(a.platform || '').trim()
    if (p) platforms[p] = (platforms[p] || 0) + 1
    const r = String(a.region || a.city || '').trim()
    if (r) regions[r] = (regions[r] || 0) + 1
    const c = String(a.category || '').trim()
    if (c) categories[c] = (categories[c] || 0) + 1
    if (a.isIce) iceCount += 1
    if (a.urgent) urgentCount += 1
  }
  const top = (obj) =>
    Object.keys(obj)
      .sort((x, y) => (obj[y] || 0) - (obj[x] || 0))
      .slice(0, 5)
  return {
    recentApplyCount: apps.length,
    preferredPlatforms: top(platforms),
    preferredRegions: top(regions),
    preferredCategories: top(categories),
    iceApplyRatio: apps.length ? Math.round((iceCount / apps.length) * 100) : 0,
    urgentApplyRatio: apps.length ? Math.round((urgentCount / apps.length) * 100) : 0,
  }
}

function fallbackTagForRow(row, talentCity) {
  return orderHighlightTag.fallbackOrderHighlightTag(orderAiPayload(row), talentCity)
}

function applyTagMap(rows, map, talentCity) {
  return rows.map((row) => {
    const hit = map[row.id]
    if (hit && hit.tag) {
      const sanitized = orderHighlightTag.sanitizeAiOrderTag(hit.tag, hit.tone, orderAiPayload(row))
      if (sanitized) {
        return {
          ...row,
          aiTag: sanitized.tag,
          aiTagTone: sanitized.tone,
          aiTagSource: 'ai',
        }
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

function talentProfileFromMember(member, opts) {
  const identity =
    (opts && opts.workIdentity) || userProfile.readIdentity() || 'talent'
  const habits = (opts && opts.applicationHabits) || applicationHabitsFromStore()
  const primary = member ? memberStore.primaryPlatformProfile(member) : null
  const prof = (primary && primary.profile) || {}
  const city = String((member && member.city) || '').trim()
  const province = String((member && member.province) || '').trim()
  const supplierSkills =
    identity === 'shoot'
      ? ['拍摄', '跟拍', '现场']
      : identity === 'edit'
        ? ['剪辑', '后期', '云剪']
        : []
  return {
    id: String((member && member.id) || '').trim(),
    workIdentity: identity,
    role: identity,
    roleLabel: identityTypes.workIdentityLabel(identity),
    recruitTarget: identityTypes.primaryRecruitTargetForIdentity(identity),
    platform: (primary && primary.platform) || '',
    nickname: prof.platformNickname || (member && member.wxNickName) || '',
    followers: prof.followers || '',
    city,
    province,
    region: [province, city].filter(Boolean).join(' · '),
    accountTags: Array.isArray(prof.accountTags) ? prof.accountTags : [],
    douyinSalesLevel: prof.douyinSalesLevel || '',
    quotePrice: prof.quotePrice || '',
    supplierSkills,
    applicationHabits: habits,
  }
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

function applyMatchMap(rows, map, talent, talentCity) {
  return applyOrderMatchResults(rows, map, talent, talentCity)
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

function mergeCardAiTags(scored, tagged) {
  const byId = {}
  for (const r of tagged) byId[r.id] = r
  return scored.map((row) => {
    const t = byId[row.id]
    if (!t) return row
    const tagFromAi = t.aiTagSource === 'ai' && t.aiTag
    return {
      ...row,
      aiTag: tagFromAi ? t.aiTag : t.aiTag || row.aiTag,
      aiTagTone: tagFromAi ? t.aiTagTone : t.aiTagTone || row.aiTagTone,
      aiTagSource: tagFromAi ? 'ai' : t.aiTagSource || row.aiTagSource,
    }
  })
}

async function enrichOrderMatches(rows, member, opts) {
  const list = (rows || []).filter((r) => r && r.id && !r.isMock)
  const habits = applicationHabitsFromStore()
  const talent = talentProfileFromMember(member, {
    workIdentity: opts && opts.workIdentity,
    applicationHabits: habits,
  })
  const talentCity = talent && talent.city ? talent.city : ''
  const tagPromise = enrichOrderTags(list, { talentCity })

  if (!list.length) {
    return tagPromise
  }
  if (!api.hasApi() || !talent) {
    const tagged = await tagPromise
    if (!talent) return tagged.map((r) => ({ ...r, matchScore: 0, aiMatch: false }))
    const local = applyMatchMap(list, {}, talent, talentCity)
    return mergeCardAiTags(local, tagged).sort((a, b) => {
      const d = (b.matchScore || 0) - (a.matchScore || 0)
      if (d !== 0) return d
      return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
    })
  }

  const suffix = talentMatchCacheKey(talent)
  const cache = readCache(MATCH_CACHE_KEY)
  const bucket = cache[suffix] && typeof cache[suffix] === 'object' ? cache[suffix] : {}
  const missing = []
  const map = {}
  for (const row of list) {
    const ck = `${row.id}:${hallKey(row)}`
    if (bucket[ck]) map[row.id] = bucket[ck]
    else missing.push(row)
  }
  if (missing.length) {
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

  const scored = applyMatchMap(list, map, talent, talentCity)
  const tagged = await tagPromise
  const enriched = mergeCardAiTags(scored, tagged)
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

function orderMatchesPrBoard(row, mp, board) {
  if (!row) return false
  const target = board === 'shoot' ? 'shoot' : board === 'edit' ? 'edit' : 'talent'
  if (row.recruitTarget === target) return true
  if (board === 'edit' && row.isIce) return true
  if (board === 'talent' && mp && isIceMpOrder(mp)) return false
  return false
}

function currentPrOrderOwnerKeys() {
  const account = auth.readAccount()
  const pr = userProfile.readPrProfile() || userProfile.emptyPrProfile()
  const keys = new Set()
  const pk = participant.prParticipantKey(pr)
  if (pk) keys.add(pk)
  const lingqiPrId = String((account && account.lingqiPrId) || pr.lingqiPrId || '').trim()
  if (lingqiPrId) keys.add(lingqiPrId)
  const registryPrId = String((account && account.registryPrId) || pr.id || '').trim()
  if (registryPrId) keys.add(registryPrId)
  const openid = String((account && account.openid) || pr.wxOpenId || '').trim()
  if (openid) keys.add(openid)
  const phone = String(pr.contactPhone || (account && account.loginName) || '')
    .replace(/\D/g, '')
    .slice(-11)
  if (phone.length === 11) keys.add(`pr_${phone}`)
  return keys
}

function mpOwnedByCurrentPr(mp) {
  if (!mp || mp.publisherIdentity !== 'pr') return false
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const keys = currentPrOrderOwnerKeys()
  const prKey = String(meta.prParticipantKey || '').trim()
  if (prKey && keys.has(prKey)) return true
  const lingqi = String(meta.lingqiPrId || meta.prLingqiPrId || '').trim()
  if (lingqi && keys.has(lingqi)) return true
  const registryId = String(meta.registryPrId || meta.prRegistryId || '').trim()
  if (registryId && keys.has(registryId)) return true
  const openid = String(meta.publisherOpenid || meta.prOpenid || '').trim()
  if (openid && keys.has(openid)) return true
  return false
}

function appendEligiblePack(out, seen, mp, reg, board) {
  if (!mp || !mp.id) return
  const id = String(mp.id).trim()
  if (!id || seen.has(id)) return
  if (mp.status !== 'open' && mp.status !== 'collecting') return
  const row = orderCard.mapMpOrderRow(mp, reg)
  if (board && !orderMatchesPrBoard(row, mp, board)) return
  seen.add(id)
  out.push({ mp, row, payload: prOrderAiPayload(mp, row) })
}

function listPrEligibleOrders(reg, opts) {
  const board = (opts && opts.board) || (opts && opts.recruitTarget) || 'talent'
  const local = applicationsStore.readPublishedOrders()
  const mpList = Array.isArray(reg?.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const out = []
  const seen = new Set()
  for (const item of local) {
    if (!item || !item.mpOrderId) continue
    const mp = mpList.find((o) => o && o.id === item.mpOrderId)
    if (!mp) continue
    appendEligiblePack(out, seen, mp, reg, board)
  }
  for (const mp of mpList) {
    if (!mpOwnedByCurrentPr(mp)) continue
    appendEligiblePack(out, seen, mp, reg, board)
  }
  return out
}

function resolvePrMatchOrders(reg, opts) {
  const all = listPrEligibleOrders(reg, opts)
  const selected = String((opts && opts.mpOrderId) || '').trim()
  if (selected && selected !== 'recent') {
    const hit = all.filter((p) => String(p.row.id) === selected)
    if (hit.length) return hit
  }
  return all.slice(0, 6)
}

/** PR 本地发单 + 注册表，取最近开放中的招募单（最多 6 条），可按板块筛选 */
function resolvePrRecentOrders(reg, opts) {
  return resolvePrMatchOrders(reg, opts)
}

function talentAiPayload(row, board) {
  const wid = board === 'shoot' ? 'shoot' : board === 'edit' ? 'edit' : 'talent'
  const skills =
    wid === 'shoot'
      ? ['拍摄', '跟拍', ...(row.tags || [])]
      : wid === 'edit'
        ? ['剪辑', '后期', ...(row.tags || [])]
        : row.tags || []
  return {
    id: row.id,
    workIdentity: wid,
    role: wid,
    roleLabel: wid === 'shoot' ? '拍摄团队' : wid === 'edit' ? '剪辑团队' : '达人',
    recruitTarget: wid,
    platform: row.platform || '',
    nickname: row.name || '',
    followers: row.followersRaw != null ? row.followersRaw : row.followers,
    region: row.region || '',
    accountTags: row.accountTags || row.tags || [],
    douyinSalesLevel: row.douyinSalesLevel || row.salesGrade || '',
    gender: row.gender || '',
    quality: row.quality || '',
    tags: row.tags || [],
    supplierSkills: skills.slice(0, 8),
    quotePrice: row.quotePrice || '',
  }
}

function prOrdersCacheKey(orderPayloads) {
  return orderPayloads
    .map((p) => p.id)
    .join(',')
    .slice(0, 80)
}

function fallbackTalentScore(talent, orderPayloads, board) {
  if (!orderPayloads.length) return { score: 0, tag: '', tone: 'default' }
  const wid = board === 'shoot' ? 'shoot' : board === 'edit' ? 'edit' : 'talent'
  const parts = String(talent.region || '')
    .split('·')
    .map((s) => s.trim())
  const profile = {
    workIdentity: wid,
    platform: talent.platform || '',
    followers: talent.followersRaw != null ? talent.followersRaw : talent.followers,
    city: parts[1] || parts[0] || '',
    province: parts[0] || '',
    accountTags: [...(talent.accountTags || []), ...(talent.tags || [])],
  }
  let best = 0
  let tag = '可沟通'
  for (const o of orderPayloads) {
    const fb = fallbackOrderMatchScore(o, profile)
    if (fb.score > best) {
      best = fb.score
      tag = fb.tag
    }
  }
  return { score: best, tag, tone: best >= 58 ? 'match' : 'default' }
}

async function fetchPrTalentMatchItems(orderPayloads, talents, board) {
  const map = {}
  for (const part of chunk(talents, TALENT_BATCH_SIZE)) {
    try {
      const res = await postAi({
        mode: 'match_talent',
        orders: orderPayloads,
        talents: part.map((t) => talentAiPayload(t, board)),
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

function applyTalentMatchMap(talents, map, orderPayloads, board) {
  return talents.map((t) => {
    if (t.isPreview) return { ...t, matchScore: 0, aiTag: '预览', aiTagTone: 'default' }
    const hit = map[t.id]
    const fb = fallbackTalentScore(t, orderPayloads, board)
    if (hit && hit.score > 0) {
      const score = Math.max(0, Math.min(100, Math.round(Number(hit.score) || 0)))
      return {
        ...t,
        matchScore: score,
        aiTag: hit.tag || (score >= 75 ? '高匹配' : fb.tag),
        aiTagTone: hit.tone || (score >= 75 ? 'match' : fb.tone),
        aiMatch: score >= 55,
        aiTagSource: 'ai',
      }
    }
    return {
      ...t,
      matchScore: fb.score,
      aiTag: fb.tag,
      aiTagTone: fb.tone,
      aiMatch: fb.score >= 55,
      aiTagSource: 'local',
    }
  })
}

async function enrichTalentMatchesForPr(talents, reg, opts) {
  const board = (opts && opts.board) || 'talent'
  const list = (talents || []).filter((t) => t && t.id && !t.isPreview)
  const packs = resolvePrMatchOrders(reg, opts)
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
    return applyTalentMatchMap(list, {}, orderPayloads, board)
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
    const fresh = await fetchPrTalentMatchItems(orderPayloads, missing, board)
    for (const t of missing) {
      if (fresh[t.id]) {
        map[t.id] = fresh[t.id]
        bucket[t.id] = fresh[t.id]
      }
    }
    cache[oKey] = bucket
    writeCache(PR_TALENT_MATCH_CACHE_KEY, cache)
  }

  const enriched = applyTalentMatchMap(list, map, orderPayloads, board)
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
  listPrEligibleOrders,
  resolvePrMatchOrders,
  resolvePrRecentOrders,
  orderMatchesPrBoard,
  fallbackTagForRow,
  fallbackTalentScore,
  talentProfileFromMember,
  applicationHabitsFromStore,
}
