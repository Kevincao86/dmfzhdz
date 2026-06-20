import type { MpRegistry, RecruitmentOrderRow, TalentCardRow } from './types'
import { postMpRecruitmentAi } from '../mpApi'
import { attachHallCardHighlightTags } from './listFilters'
import { isIceMpOrder, mapMpOrderRow } from './orderCard'
import { readPublishedOrders } from './publishedOrders'
import { mpOrderOwnedByCurrentPr } from './prPublishedOrders'
import type { PrBoardId } from './prRecommendBoard'
import { getAccount } from '../mpSession'
import { readApplications } from '../mpSync/applicationsStore'
import { primaryPlatformProfile, readMember, type TalentMember } from '../mpSync/talentMember'
import { getWorkIdentity, workIdentityLabel, type MpWorkIdentity } from '../mpWorkIdentity'
import {
  applicationHabitsFromApps,
  applyOrderMatchResults,
  clampTalentScoreForOrders,
  enrichOrderAiPayload,
  fallbackOrderAdvantage,
  fallbackOrderHighlightTag,
  fallbackOrderMatchScore,
  mergeCardAiTags,
  sanitizeAiOrderTag,
  withHallAiTagColors,
  talentMatchCacheKey,
  type ApplicationHabits,
  type OrderMatchPayload,
  type TalentMatchProfile,
} from '@merchant/lib/mpRecruitmentMatchShared'

function hallKey(row: RecruitmentOrderRow) {
  if (row.isIce) return 'ice'
  if (row.urgent) return 'urgent'
  return 'normal'
}

function orderAiPayload(row: RecruitmentOrderRow): OrderMatchPayload {
  return enrichOrderAiPayload({
    id: row.id,
    title: row.title,
    platform: row.platform,
    region: row.region,
    category: row.category,
    categoryTagsText: row.categoryTagsText,
    talentTags: row.talentTags,
    budgetText: row.budgetText,
    budgetDisplay: row.budgetDisplay,
    fansRequirement: row.fansRequirement,
    recruitTarget: row.recruitTarget || 'talent',
    hall: hallKey(row),
    urgent: row.urgent,
    isIce: row.isIce,
    isMock: row.isMock,
    summary: row.summary || '',
    recruitmentInfo: row.recruitmentInfo,
    merchantRequirements: row.merchantRequirements,
    taskDetail: row.taskDetail,
    recruitContent: row.recruitContent,
    priceAmount: row.priceAmount || 0,
  })
}

function primaryRecruitTargetForIdentity(id: MpWorkIdentity): 'talent' | 'shoot' | 'edit' {
  if (id === 'shoot') return 'shoot'
  if (id === 'edit') return 'edit'
  return 'talent'
}

export function talentProfileFromMember(
  member: TalentMember | null,
  opts?: { workIdentity?: MpWorkIdentity; applicationHabits?: ApplicationHabits },
): TalentMatchProfile | null {
  if (!member) return null
  const identity = opts?.workIdentity || getWorkIdentity()
  const habits = opts?.applicationHabits || applicationHabitsFromApps(readApplications())
  const primary = primaryPlatformProfile(member)
  const prof = primary?.profile
  const city = String(member.city || '').trim()
  const province = String(member.province || '').trim()
  const supplierSkills =
    identity === 'shoot'
      ? ['拍摄', '跟拍', '现场']
      : identity === 'edit'
        ? ['剪辑', '后期', '云剪']
        : []
  return {
    id: String(member.id || '').trim(),
    workIdentity: identity,
    role: identity,
    roleLabel: workIdentityLabel(identity),
    recruitTarget: primaryRecruitTargetForIdentity(identity),
    platform: primary?.platform || '',
    nickname: prof?.platformNickname || member.wxNickName || '',
    followers: prof?.followers ? String(prof.followers) : '',
    city,
    province,
    region: [province, city].filter(Boolean).join(' · '),
    accountTags: Array.isArray(prof?.accountTags) ? prof.accountTags : [],
    douyinSalesLevel: prof?.douyinSalesLevel || '',
    quotePrice: prof?.quotePrice || '',
    supplierSkills,
    applicationHabits: habits,
  }
}

export function fallbackTagForRow(row: RecruitmentOrderRow, talentCity = '') {
  return fallbackOrderHighlightTag(orderAiPayload(row), talentCity)
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

const AI_BATCH_SIZE = 12
const AI_BATCH_CONCURRENCY = 3
const AI_VISIBLE_LIMIT = 16

async function runAiBatches<T>(parts: T[], worker: (part: T) => Promise<void>) {
  if (!parts.length) return
  let cursor = 0
  async function loop() {
    while (cursor < parts.length) {
      const idx = cursor
      cursor += 1
      try {
        await worker(parts[idx]!)
      } catch (e) {
        console.warn('[recruitmentAi] batch failed', e)
      }
    }
  }
  const workers = Math.min(AI_BATCH_CONCURRENCY, parts.length)
  await Promise.all(Array.from({ length: workers }, () => loop()))
}

const WEB_MATCH_CACHE_KEY = 'meoo_web_ai_order_match_v3'
const WEB_TAG_CACHE_KEY = 'meoo_web_ai_order_tags_v5'
const WEB_PR_TALENT_MATCH_CACHE_KEY = 'meoo_web_ai_pr_talent_match_v1'
const WEB_MATCH_CACHE_TTL_MS = 6 * 3600 * 1000

function readWebTagCache(): Record<string, { tag: string; tone: string; source?: string }> {
  try {
    const raw = sessionStorage.getItem(WEB_TAG_CACHE_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as { data?: Record<string, { tag: string; tone: string; source?: string }> }
    return j.data && typeof j.data === 'object' ? j.data : {}
  } catch {
    return {}
  }
}

function writeWebTagCache(data: Record<string, { tag: string; tone: string; source?: string }>) {
  try {
    sessionStorage.setItem(WEB_TAG_CACHE_KEY, JSON.stringify({ data }))
  } catch {
    /* ignore */
  }
}

function readOrderTagFromCache(
  cache: Record<string, { tag: string; tone: string; source?: string }>,
  orderId: string,
) {
  const id = String(orderId || '').trim()
  if (!id) return null
  if (cache[id]?.tag) return cache[id]
  for (const k of Object.keys(cache)) {
    if (k.startsWith(`${id}:`) && cache[k]?.tag) return cache[k]
  }
  return null
}

function writeOrderTagToCache(
  cache: Record<string, { tag: string; tone: string; source?: string }>,
  orderId: string,
  entry: { tag: string; tone?: string; source?: string },
) {
  const id = String(orderId || '').trim()
  if (!id || !entry.tag) return
  cache[id] = {
    tag: String(entry.tag),
    tone: String(entry.tone || 'default'),
    source: String(entry.source || 'ai'),
  }
}

export function readCachedTagForOrder(orderId: string) {
  return readOrderTagFromCache(readWebTagCache(), orderId)
}

/** 注册表已持久化或本地已打标 → 直接展示，不再走 AI */
export function resolveRowHallTag(row: RecruitmentOrderRow): RecruitmentOrderRow | null {
  if (!row.id) return null
  if (row.aiTagSource === 'persisted' && row.aiTag) return attachRowTagStyle(row)
  const cached = readCachedTagForOrder(row.id)
  if (!cached?.tag) return null
  const sanitized = sanitizeAiOrderTag(cached.tag, cached.tone, orderAiPayload(row))
  if (!sanitized) return null
  const styled = withHallAiTagColors(sanitized.tag, sanitized.tone)
  const src =
    cached.source === 'persisted'
      ? ('persisted' as const)
      : cached.source === 'local'
        ? ('local' as const)
        : ('ai' as const)
  return { ...row, ...styled, aiTagSource: src }
}

function readWebMatchCache(): Record<string, Record<string, { score: number; tag: string; tone: string; advantage?: string }>> {
  try {
    const raw = sessionStorage.getItem(WEB_MATCH_CACHE_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as { expiresAt?: number; data?: Record<string, Record<string, { score: number; tag: string; tone: string; advantage?: string }>> }
    if (j.expiresAt && Date.now() > j.expiresAt) return {}
    return j.data && typeof j.data === 'object' ? j.data : {}
  } catch {
    return {}
  }
}

function writeWebMatchCache(data: Record<string, Record<string, { score: number; tag: string; tone: string; advantage?: string }>>) {
  try {
    sessionStorage.setItem(
      WEB_MATCH_CACHE_KEY,
      JSON.stringify({ expiresAt: Date.now() + WEB_MATCH_CACHE_TTL_MS, data }),
    )
  } catch {
    /* ignore */
  }
}

function readWebPrTalentMatchCache(): Record<
  string,
  Record<string, { score: number; tag: string; tone: string; advantage?: string }>
> {
  try {
    const raw = localStorage.getItem(WEB_PR_TALENT_MATCH_CACHE_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as {
      data?: Record<string, Record<string, { score: number; tag: string; tone: string; advantage?: string }>>
    }
    return j.data && typeof j.data === 'object' ? j.data : {}
  } catch {
    return {}
  }
}

function writeWebPrTalentMatchCache(
  data: Record<string, Record<string, { score: number; tag: string; tone: string; advantage?: string }>>,
) {
  try {
    localStorage.setItem(WEB_PR_TALENT_MATCH_CACHE_KEY, JSON.stringify({ data }))
  } catch {
    /* ignore */
  }
}

function prOrdersCacheKey(orderPayloads: Record<string, unknown>[], board?: PrBoardId) {
  const ids = orderPayloads
    .map((p) => `${String(p.id || '')}:${String(p.updatedAt || p.publishedAt || '')}`)
    .join('|')
  return `${board || 'talent'}:${ids}`.slice(0, 200)
}

async function fetchOrderMatchMap(
  list: RecruitmentOrderRow[],
  talent: TalentMatchProfile,
): Promise<Record<string, { score: number; tag: string; tone: string; advantage?: string }>> {
  const suffix = talentMatchCacheKey(talent)
  const cache = readWebMatchCache()
  const bucket = cache[suffix] && typeof cache[suffix] === 'object' ? { ...cache[suffix] } : {}
  const missing: RecruitmentOrderRow[] = []
  const map: Record<string, { score: number; tag: string; tone: string; advantage?: string }> = {}
  for (const row of list) {
    const ck = `${row.id}:${hallKey(row)}`
    if (bucket[ck]) map[row.id] = bucket[ck]
    else missing.push(row)
  }
  await runAiBatches(chunk(missing.slice(0, AI_VISIBLE_LIMIT), AI_BATCH_SIZE), async (part) => {
    const res = await postMpRecruitmentAi({ mode: 'match', orders: part.map(orderAiPayload), talent })
    const items = Array.isArray(res.items) ? res.items : []
    for (const it of items) {
      if (!it?.id) continue
      map[String(it.id)] = {
        score: Number(it.score) || 0,
        tag: String(it.tag || ''),
        tone: String(it.tone || 'default'),
        advantage: String((it as { advantage?: string }).advantage || '').trim(),
      }
    }
    for (const row of part) {
      const ck = `${row.id}:${hallKey(row)}`
      if (map[row.id]) bucket[ck] = map[row.id]
    }
  })
  cache[suffix] = bucket
  writeWebMatchCache(cache)
  return map
}

function attachRowTagStyle(row: RecruitmentOrderRow): RecruitmentOrderRow {
  if (!row.aiTag) return row
  const styled = withHallAiTagColors(row.aiTag, row.aiTagTone || 'default', {
    bg: row.aiTagBg,
    fg: row.aiTagFg,
  })
  return { ...row, ...styled }
}

export async function enrichOrderTags(rows: RecruitmentOrderRow[], talentCity = '') {
  const list = rows.filter((r) => r.id)
  if (!list.length) return list

  const persisted = list.filter((r) => r.aiTagSource === 'persisted' && r.aiTag)
  const pending = list.filter((r) => r.aiTagSource !== 'persisted')
  if (!pending.length) return list.map((r) => attachHallCardHighlightTags(attachRowTagStyle(r)))

  const cache = readWebTagCache()
  const missing: RecruitmentOrderRow[] = []
  const map: Record<string, { tag: string; tone: string; source?: string }> = {}
  for (const row of pending) {
    const hit = readOrderTagFromCache(cache, row.id)
    if (hit) map[row.id] = hit
    else missing.push(row)
  }

  let aiHit = Object.keys(map).length > 0
  if (missing.length) {
    await runAiBatches(chunk(missing.slice(0, AI_VISIBLE_LIMIT), AI_BATCH_SIZE), async (part) => {
      const res = await postMpRecruitmentAi({ mode: 'tag', orders: part.map(orderAiPayload) })
      const items = Array.isArray(res.items) ? res.items : []
      if (items.length) aiHit = true
      for (const it of items) {
        if (it?.id && it.tag) {
          map[String(it.id)] = {
            tag: String(it.tag),
            tone: String(it.tone || 'default'),
            source: String((it as { source?: string }).source || 'ai'),
          }
        }
      }
      for (const row of part) {
        if (map[row.id]) writeOrderTagToCache(cache, row.id, map[row.id])
      }
    })
  }

  const tagged = pending.map((row) => {
    const hit = map[row.id]
    if (hit?.tag) {
      const sanitized = sanitizeAiOrderTag(hit.tag, hit.tone, orderAiPayload(row))
      if (sanitized) {
        const src =
          hit.source === 'persisted'
            ? ('persisted' as const)
            : hit.source === 'local'
              ? ('local' as const)
              : ('ai' as const)
        const styled = withHallAiTagColors(sanitized.tag, sanitized.tone, {
          bg: String((hit as { bg?: string }).bg || '').trim(),
          fg: String((hit as { fg?: string }).fg || '').trim(),
        })
        return { ...row, ...styled, aiTagSource: src }
      }
    }
    if (!aiHit) {
      const fb = fallbackTagForRow(row, talentCity)
      const styled = withHallAiTagColors(fb.aiTag, fb.aiTagTone)
      return { ...row, ...styled, aiTagSource: 'local' as const }
    }
    return { ...row, aiTag: '', aiTagTone: 'default', aiTagBg: '', aiTagFg: '', aiTagSource: 'pending' as const }
  })

  for (const r of tagged) {
    if (r.aiTag && r.aiTagSource && r.aiTagSource !== 'pending') {
      writeOrderTagToCache(cache, r.id, {
        tag: r.aiTag,
        tone: r.aiTagTone,
        source: r.aiTagSource,
      })
    }
  }
  writeWebTagCache(cache)

  const byId = new Map([...persisted, ...tagged].map((r) => [r.id, r]))
  return list.map((r) => attachHallCardHighlightTags(attachRowTagStyle(byId.get(r.id) || r)))
}

export function fallbackOrderAdvantageForRow(row: RecruitmentOrderRow, talentCity = '') {
  return fallbackOrderAdvantage(orderAiPayload(row), null, talentCity)
}

export async function enrichOrderMatches(
  rows: RecruitmentOrderRow[],
  member: TalentMember | null,
  opts?: { workIdentity?: MpWorkIdentity },
) {
  const list = rows.filter((r) => r.id && !r.isMock)
  const talent = talentProfileFromMember(member ?? readMember(), opts)
  const talentCity = talent?.city || ''
  const tagPromise = enrichOrderTags(list, talentCity)

  if (!list.length) {
    return tagPromise
  }
  if (!talent) {
    const tagged = await tagPromise
    return tagged.map((r) => ({
      ...r,
      matchScore: 0,
      aiMatch: false,
      aiAdvantage: fallbackOrderAdvantage(orderAiPayload(r), null, talentCity),
    }))
  }

  const map = await fetchOrderMatchMap(list, talent)
  const scored = applyOrderMatchResults(list, map, talent, talentCity)
  const tagged = await tagPromise
  const enriched = mergeCardAiTags(scored, tagged)
  enriched.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0) || (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
  return enriched
}

function prOrderAiPayload(mp: Record<string, unknown>, row: RecruitmentOrderRow) {
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? (mp.mpPublishMeta as Record<string, unknown>) : {}
  const info = String(mp.recruitmentInfo || mp.merchantRequirements || '').slice(0, 500)
  return {
    ...orderAiPayload(row),
    updatedAt: String(mp.updatedAt || mp.createdAt || row.publishedAtMs || '').trim(),
    talentTags: Array.isArray(meta.talentTags) ? meta.talentTags : [],
    infoSummary: info,
    recruitDetail: String(meta.recruitDetail || '').slice(0, 200),
  }
}

export function orderMatchesPrBoard(row: RecruitmentOrderRow, mp: Record<string, unknown> | null, board: PrBoardId): boolean {
  if (!row) return false
  const target = board === 'shoot' ? 'shoot' : board === 'edit' ? 'edit' : 'talent'
  if (row.recruitTarget === target) return true
  if (board === 'edit' && row.isIce) return true
  if (board === 'talent' && mp && isIceMpOrder(mp)) return false
  return false
}

type PrEligibleOrderPack = {
  mp: Record<string, unknown>
  row: RecruitmentOrderRow
  payload: Record<string, unknown>
}

function appendEligiblePack(
  out: PrEligibleOrderPack[],
  seen: Set<string>,
  mp: Record<string, unknown>,
  reg: MpRegistry,
  board: PrBoardId,
) {
  const id = String(mp.id || '').trim()
  if (!id || seen.has(id)) return
  if (mp.status !== 'open' && mp.status !== 'collecting') return
  const row = mapMpOrderRow(mp, reg)
  if (board && !orderMatchesPrBoard(row, mp, board)) return
  seen.add(id)
  out.push({ mp, row, payload: prOrderAiPayload(mp, row) })
}

/** 本地发单 + 注册表当前 PR 归属，与小程序 recruitmentAiTags.listPrEligibleOrders 对齐 */
export function listPrEligibleOrders(reg: MpRegistry, opts?: { board?: PrBoardId; recruitTarget?: PrBoardId }) {
  const board = opts?.board || opts?.recruitTarget || 'talent'
  const local = readPublishedOrders()
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const out: PrEligibleOrderPack[] = []
  const seen = new Set<string>()
  const account = getAccount()

  for (const item of local) {
    if (!item?.mpOrderId) continue
    const mp = mpList.find((o) => o && o.id === item.mpOrderId) as Record<string, unknown> | undefined
    if (!mp) continue
    appendEligiblePack(out, seen, mp, reg, board)
  }
  for (const mp of mpList) {
    if (!mp || typeof mp !== 'object') continue
    const row = mp as Record<string, unknown>
    if (!mpOrderOwnedByCurrentPr(row, account)) continue
    appendEligiblePack(out, seen, row, reg, board)
  }
  return out
}

export function resolvePrMatchOrders(
  reg: MpRegistry,
  opts?: { board?: PrBoardId; recruitTarget?: PrBoardId; mpOrderId?: string | null },
) {
  const all = listPrEligibleOrders(reg, opts)
  const selected = String(opts?.mpOrderId || '').trim()
  if (selected && selected !== 'recent') {
    const hit = all.filter((p) => String(p.row.id) === selected)
    if (hit.length) return hit
  }
  return all.slice(0, 6)
}

/** @deprecated 使用 resolvePrMatchOrders */
export function resolvePrRecentOrders(reg: MpRegistry, opts?: { board?: PrBoardId; recruitTarget?: PrBoardId }) {
  return resolvePrMatchOrders(reg, opts)
}

export function fallbackTalentScore(
  talent: TalentCardRow,
  orderPayloads: Record<string, unknown>[],
  board?: PrBoardId,
): { score: number; tag: string; tone: string; advantage: string } {
  if (!orderPayloads.length) return { score: 0, tag: '', tone: 'default', advantage: '' }
  const wid = board === 'shoot' ? 'shoot' : board === 'edit' ? 'edit' : 'talent'
  const parts = String(talent.region || '')
    .split('·')
    .map((s) => s.trim())
  const profile: TalentMatchProfile = {
    workIdentity: wid,
    platform: talent.platform,
    followers: talent.followersRaw,
    city: parts[1] || parts[0] || '',
    province: parts[0] || '',
    accountTags: [...(talent.accountTags || []), ...(talent.tags || [])],
  }
  let best = 0
  let tag = '可沟通'
  for (const o of orderPayloads) {
    const fb = fallbackOrderMatchScore(o as OrderMatchPayload, profile)
    if (fb.score > best) {
      best = fb.score
      tag = fb.tag
    }
  }
  return { score: best, tag, tone: best >= 58 ? 'match' : 'default', advantage: fallbackTalentAdvantage(talent) }
}

function fallbackTalentAdvantage(talent: TalentCardRow): string {
  const parts: string[] = []
  if (talent.followersRaw >= 100000) parts.push(`粉丝 ${talent.followers}，头部曝光`)
  else if (talent.followersRaw >= 10000) parts.push(`粉丝 ${talent.followers}，种草转化稳定`)
  const region = String(talent.region || '').split('·')[0]?.trim()
  if (region) parts.push(`${region}本地达人`)
  const niche = talent.accountTags[0] || talent.tags.find((t) => !['优质', '推荐', '新锐', '抖音', '小红书'].includes(t))
  if (niche) parts.push(`擅长${niche}内容`)
  return parts.slice(0, 2).join('；') || '资料完整，可沟通合作细节'
}

function talentAiPayload(row: TalentCardRow, board?: PrBoardId) {
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
    platform: row.platform,
    nickname: row.name,
    followers: row.followersRaw,
    region: row.region,
    accountTags: row.accountTags || row.tags,
    douyinSalesLevel: row.douyinSalesLevel || row.salesGrade,
    gender: row.gender,
    quality: row.quality,
    tags: row.tags,
    supplierSkills: skills.slice(0, 8),
    quotePrice: (row as { quotePrice?: string }).quotePrice || '',
  }
}

export async function enrichTalentMatchesForPr(
  rows: TalentCardRow[],
  reg: MpRegistry,
  opts?: { board?: PrBoardId; mpOrderId?: string | null },
) {
  const board = opts?.board || 'talent'
  const list = rows
    .filter((t) => t?.id && !t.isPreview)
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
  const packs = resolvePrMatchOrders(reg, opts)
  const orderPayloads = packs.map((p) => p.payload)
  if (!orderPayloads.length) return list

  const oKey = prOrdersCacheKey(orderPayloads, board)
  const cache = readWebPrTalentMatchCache()
  const bucket = cache[oKey] && typeof cache[oKey] === 'object' ? { ...cache[oKey] } : {}
  const missing: TalentCardRow[] = []
  const map: Record<string, { score: number; tag: string; tone: string; advantage?: string }> = {}
  for (const t of list) {
    if (bucket[t.id]) map[t.id] = bucket[t.id]
    else missing.push(t)
  }

  if (missing.length) {
    await runAiBatches(chunk(missing.slice(0, AI_VISIBLE_LIMIT), AI_BATCH_SIZE), async (part) => {
      const res = await postMpRecruitmentAi({
        mode: 'match_talent',
        orders: orderPayloads,
        talents: part.map((t) => talentAiPayload(t, board)),
      })
      const items = Array.isArray(res.items) ? res.items : []
      for (const it of items) {
        if (!it?.id) continue
        map[String(it.id)] = {
          score: Number(it.score) || 0,
          tag: String(it.tag || ''),
          tone: String(it.tone || 'default'),
          advantage: String((it as { advantage?: string }).advantage || '').trim(),
        }
      }
      for (const t of part) {
        if (map[t.id]) bucket[t.id] = map[t.id]
      }
    })
    cache[oKey] = bucket
    writeWebPrTalentMatchCache(cache)
  }

  return list
    .map((t) => {
      const hit = map[t.id]
      if (hit && hit.score > 0) {
        const parts = String(t.region || '')
          .split('·')
          .map((s) => s.trim())
        const wid = board === 'shoot' ? 'shoot' : board === 'edit' ? 'edit' : 'talent'
        const profile: TalentMatchProfile = {
          workIdentity: wid,
          platform: t.platform,
          followers: t.followersRaw,
          city: parts[1] || parts[0] || '',
          province: parts[0] || '',
          accountTags: [...(t.accountTags || []), ...(t.tags || [])],
        }
        const score = clampTalentScoreForOrders(
          Math.min(100, Math.round(hit.score)),
          orderPayloads as OrderMatchPayload[],
          profile,
        )
        const tag = hit.tag || (score >= 72 ? '高匹配' : t.aiTag || '')
        const tone = hit.tone || 'match'
        const styled = withHallAiTagColors(tag, tone)
        return {
          ...t,
          matchScore: score,
          ...styled,
          aiAdvantage: hit.advantage || fallbackTalentAdvantage(t),
          aiMatch: score >= 55,
          aiTagSource: 'ai' as const,
        }
      }
      const fb = fallbackTalentScore(t, orderPayloads, board)
      const styled = withHallAiTagColors(fb.tag, fb.tone)
      return {
        ...t,
        matchScore: fb.score,
        ...styled,
        aiAdvantage: fb.advantage,
        aiMatch: fb.score >= 55,
        aiTagSource: 'local' as const,
      }
    })
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0) || (b.followersRaw || 0) - (a.followersRaw || 0))
}
