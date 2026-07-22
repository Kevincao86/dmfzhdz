import { inferKolTierFromApplicant, type KolTierKey } from './merchantRecruitmentTierPlan'
import {
  formatCityTierBandsSummary,
  resolveCityKolTierBands,
  type CityKolTierBands,
  type KolTierBand,
} from './recruitmentCityTierPricing'
import type { RegistryTalentLibraryEntry } from './opsRegistryTypes'

export type TierAvgPrices = Record<KolTierKey, { avgYuan: number; sampleCount: number }>

export type TalentLibraryCitySource = 'city' | 'nationwide_local_life'

export type TalentLibraryPricingContext = {
  tierAvgs: TierAvgPrices
  filterCity: string
  filterPlatform: string
  totalEntries: number
  matchedEntries: number
  priceSource: 'library' | 'city_bands'
  /** 同城命中 vs 全国本地生活回退 */
  citySource?: TalentLibraryCitySource
}

export type TierAllocationResult = {
  v3: number
  v4: number
  v5: number
  v5plus: number
  estimatedCostYuan: number
  withinBudget: boolean
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

function bandMid(b: KolTierBand): number {
  if (b.max == null) return Math.max(b.min, b.min + 80)
  return Math.round((b.min + b.max) / 2)
}

/** 解析达人库报价字符串（支持区间与货币符号） */
export function parseQuotePriceYuan(raw: string): number | null {
  const s = String(raw || '')
    .replace(/[,，]/g, '')
    .trim()
  if (!s) return null
  const nums = s.match(/\d+(?:\.\d+)?/g)?.map((x) => Number(x)) ?? []
  const valid = nums.filter((n) => Number.isFinite(n) && n > 0)
  if (valid.length === 0) return null
  if (valid.length === 1) return Math.round(valid[0]!)
  return Math.round((valid[0]! + valid[valid.length - 1]!) / 2)
}

export function normalizeRecruitmentCity(city: string): string {
  return city.trim().replace(/市$/u, '').replace(/\s/g, '').toLowerCase()
}

export function cityMatchesTalentEntry(entryCity: string | undefined, targetCity: string): boolean {
  const target = normalizeRecruitmentCity(targetCity)
  if (!target) return true
  const ec = String(entryCity || '').trim()
  if (!ec) return true
  return normalizeRecruitmentCity(ec) === target
}

/** 严格同城：entry.city 为空不算该城有数据 */
export function cityMatchesTalentEntryStrict(
  entryCity: string | undefined,
  targetCity: string,
): boolean {
  const target = normalizeRecruitmentCity(targetCity)
  if (!target) return false
  const ec = String(entryCity || '').trim()
  if (!ec) return false
  return normalizeRecruitmentCity(ec) === target
}

/** 本地生活相关达人（标签/昵称含探店、团购、餐饮等） */
export function isLocalLifeTalentEntry(entry: RegistryTalentLibraryEntry): boolean {
  const tags = Array.isArray(entry.accountTags) ? entry.accountTags.map((t) => String(t)) : []
  const blob = [...tags, entry.platformNickname || '', entry.douyinSalesLevel || ''].join(' ')
  return /本地生活|探店|团购|餐饮|美食|到店|生活服务|种草|带货/.test(blob)
}

export type TalentLibraryCityResolve = {
  /** 供均价/方案使用的达人子集（已按平台过滤） */
  entries: RegistryTalentLibraryEntry[]
  filterCity: string
  platform: RegistryTalentLibraryEntry['platform']
  source: TalentLibraryCitySource
  cityMatchedCount: number
  nationwideLocalLifeCount: number
  totalEntries: number
}

function platformFilter(
  entries: RegistryTalentLibraryEntry[],
  platform: RegistryTalentLibraryEntry['platform'],
): RegistryTalentLibraryEntry[] {
  return entries.filter((e) => e.platform === platform)
}

/**
 * 写死规则：达人方案/招募须先按门店城市从达人库取数；
 * 该城无数据时，回退为全国「本地生活」达人；仍无则用全平台库内条目。
 */
export function resolveTalentLibraryEntriesForCity(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform?: RegistryTalentLibraryEntry['platform']
}): TalentLibraryCityResolve {
  const all = Array.isArray(params.entries) ? params.entries : []
  const city = params.city.trim()
  const platform = params.platform ?? '抖音'
  const byPlatform = platformFilter(all, platform)

  const cityMatched = city
    ? byPlatform.filter((e) => cityMatchesTalentEntryStrict(e.city, city))
    : []
  if (cityMatched.length > 0) {
    return {
      entries: cityMatched,
      filterCity: city,
      platform,
      source: 'city',
      cityMatchedCount: cityMatched.length,
      nationwideLocalLifeCount: 0,
      totalEntries: all.length,
    }
  }

  const nationwideLocalLife = byPlatform.filter(isLocalLifeTalentEntry)
  if (nationwideLocalLife.length > 0) {
    return {
      entries: nationwideLocalLife,
      filterCity: city || '全国',
      platform,
      source: 'nationwide_local_life',
      cityMatchedCount: 0,
      nationwideLocalLifeCount: nationwideLocalLife.length,
      totalEntries: all.length,
    }
  }

  return {
    entries: byPlatform,
    filterCity: city || '全国',
    platform,
    source: 'nationwide_local_life',
    cityMatchedCount: 0,
    nationwideLocalLifeCount: 0,
    totalEntries: all.length,
  }
}

/** 注入 AI 运营方案 / 智能体：脱敏达人库摘要（不含联系方式） */
function formatTalentLibrarySampleLine(e: RegistryTalentLibraryEntry): string {
  const tags = Array.isArray(e.accountTags) ? e.accountTags.slice(0, 4).join('/') : ''
  const fans = Number(e.followers) > 0 ? `粉丝${e.followers}` : ''
  const quote = String(e.quotePrice || '').trim()
  const cityLabel = String(e.city || '').trim() || '未填城'
  const level = String(e.douyinSalesLevel || '').trim()
  const levelBit = level ? `·等级${level}` : ''
  return `- ${e.platformNickname || e.platformAccount || '达人'}（${cityLabel}${fans ? `·${fans}` : ''}${quote ? `·报价${quote}` : ''}${levelBit}${tags ? `·${tags}` : ''}）`
}

function talentEntryDisplayName(e: RegistryTalentLibraryEntry): string {
  return String(e.platformNickname || e.platformAccount || '').trim() || '达人'
}

/** 星选达人库分层：头部=5级及以上(V5/V5+)，腰尾=3–4级(V3/V4) */
export type TalentLibraryPlanInsight = {
  sourceLabel: string
  citySource: TalentLibraryCitySource | 'empty'
  filterCity: string
  platform: string
  /** 头部：销售等级 5 级及以上（V5 / V5+） */
  headCount: number
  /** 腰尾部：销售等级 3–4 级（V3 / V4） */
  midTailCount: number
  headSamples: string[]
  midTailSamples: string[]
  tierAvgSummary: string
  matchedEntries: number
}

export function buildTalentLibraryPlanInsight(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform?: RegistryTalentLibraryEntry['platform']
  maxSamplesPerBand?: number
}): TalentLibraryPlanInsight {
  const resolved = resolveTalentLibraryEntriesForCity({
    entries: params.entries,
    city: params.city,
    platform: params.platform,
  })
  const ctx = computeTalentLibraryTierAveragesFromResolved(resolved)
  const perBand = Math.max(3, Math.min(8, params.maxSamplesPerBand ?? 5))
  const sourceLabel =
    resolved.source === 'city'
      ? `同城「${resolved.filterCity}」星选达人库（${resolved.cityMatchedCount} 人）`
      : resolved.nationwideLocalLifeCount > 0
        ? `该城暂无达人库数据，已回退全国本地生活达人（${resolved.nationwideLocalLifeCount} 人）`
        : `该城暂无达人库数据，已回退全国平台达人库（${resolved.entries.length} 人）`

  const headEntries: RegistryTalentLibraryEntry[] = []
  const midTailEntries: RegistryTalentLibraryEntry[] = []
  for (const e of resolved.entries) {
    const tier = inferKolTierFromApplicant({
      douyinSalesLevel: e.douyinSalesLevel,
      followers: e.followers,
    })
    if (tier === 'v5' || tier === 'v5plus') headEntries.push(e)
    else midTailEntries.push(e)
  }

  return {
    sourceLabel,
    citySource: resolved.source,
    filterCity: resolved.filterCity || params.city || '',
    platform: resolved.platform,
    headCount: headEntries.length,
    midTailCount: midTailEntries.length,
    headSamples: headEntries.slice(0, perBand).map(talentEntryDisplayName),
    midTailSamples: midTailEntries.slice(0, perBand).map(talentEntryDisplayName),
    tierAvgSummary: formatTierAvgSummary(ctx),
    matchedEntries:
      resolved.source === 'city'
        ? resolved.cityMatchedCount
        : resolved.nationwideLocalLifeCount || resolved.entries.length,
  }
}

export function buildTalentLibraryPlanPromptBlock(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform?: RegistryTalentLibraryEntry['platform']
  maxSamples?: number
}): string {
  const resolved = resolveTalentLibraryEntriesForCity({
    entries: params.entries,
    city: params.city,
    platform: params.platform,
  })
  const insight = buildTalentLibraryPlanInsight(params)
  const perBand = Math.max(3, Math.min(8, Math.ceil((params.maxSamples ?? 10) / 2)))

  const headEntries: RegistryTalentLibraryEntry[] = []
  const midTailEntries: RegistryTalentLibraryEntry[] = []
  for (const e of resolved.entries) {
    const tier = inferKolTierFromApplicant({
      douyinSalesLevel: e.douyinSalesLevel,
      followers: e.followers,
    })
    if (tier === 'v5' || tier === 'v5plus') headEntries.push(e)
    else midTailEntries.push(e)
  }

  const headLines = headEntries.slice(0, perBand).map(formatTalentLibrarySampleLine)
  const midTailLines = midTailEntries.slice(0, perBand).map(formatTalentLibrarySampleLine)

  return [
    '【灵祺星选达人库 · 达人方案必须基于本段，禁止凭空编造档位人数与报价】',
    `数据来源：${insight.sourceLabel}；平台 ${insight.platform}。`,
    insight.tierAvgSummary,
    `【头部达人 · 销售等级 5 级及以上（对应库内 V5 / V5+）】共 ${insight.headCount} 人` +
      (headLines.length ? `；样本（脱敏）：\n${headLines.join('\n')}` : '；暂无样本。'),
    `【腰尾部达人 · 销售等级 3–4 级（对应库内 V3 / V4）】共 ${insight.midTailCount} 人` +
      (midTailLines.length ? `；样本（脱敏）：\n${midTailLines.join('\n')}` : '；暂无样本。'),
    '撰写 talentBudget 时须分别写清：①头部（5级及以上）人数/单价/预算行；②腰尾部（3–4级）人数/单价/预算行；budgetLines.tier：头部=库内V5/V5+，腰部≈V4，尾部≈V3；note 可点名上述样本昵称；人数/单价须贴近库内均价；无同城时须注明已按全国本地生活达人行情估算。',
  ].join('\n')
}

function emptyTierAvgs(): TierAvgPrices {
  return {
    v3: { avgYuan: 0, sampleCount: 0 },
    v4: { avgYuan: 0, sampleCount: 0 },
    v5: { avgYuan: 0, sampleCount: 0 },
    v5plus: { avgYuan: 0, sampleCount: 0 },
  }
}

function tierPricesFromBands(bands: CityKolTierBands): Record<KolTierKey, number> {
  return {
    v3: bandMid(bands.v3),
    v4: bandMid(bands.v4),
    v5: bandMid(bands.v5),
    v5plus: bandMid(bands.v5plus),
  }
}

function fillMissingTierPrices(
  avgs: TierAvgPrices,
  bands: CityKolTierBands,
): { avgs: TierAvgPrices; priceSource: 'library' | 'city_bands' } {
  const mids = tierPricesFromBands(bands)
  let usedLibrary = false
  const next = emptyTierAvgs()
  for (const key of ['v3', 'v4', 'v5', 'v5plus'] as const) {
    if (avgs[key].sampleCount > 0 && avgs[key].avgYuan > 0) {
      next[key] = avgs[key]
      usedLibrary = true
    } else {
      next[key] = { avgYuan: mids[key], sampleCount: 0 }
    }
  }
  return { avgs: next, priceSource: usedLibrary ? 'library' : 'city_bands' }
}

function accumulateTierFromEntries(entries: RegistryTalentLibraryEntry[]): {
  rawAvgs: TierAvgPrices
  matched: number
} {
  const buckets: Record<KolTierKey, number[]> = { v3: [], v4: [], v5: [], v5plus: [] }
  let matched = 0
  for (const entry of entries) {
    const price = parseQuotePriceYuan(entry.quotePrice)
    if (!price || price <= 0) continue
    matched += 1
    const tier = inferKolTierFromApplicant({
      douyinSalesLevel: entry.douyinSalesLevel,
      followers: entry.followers,
    })
    buckets[tier].push(price)
  }
  const rawAvgs = emptyTierAvgs()
  for (const key of ['v3', 'v4', 'v5', 'v5plus'] as const) {
    const list = buckets[key]
    if (list.length === 0) continue
    const sum = list.reduce((a, b) => a + b, 0)
    rawAvgs[key] = { avgYuan: Math.round(sum / list.length), sampleCount: list.length }
  }
  return { rawAvgs, matched }
}

/** 对已 resolve 的子集统计档位均价（不再二次按城过滤） */
export function computeTalentLibraryTierAveragesFromResolved(
  resolved: TalentLibraryCityResolve,
): TalentLibraryPricingContext {
  const { rawAvgs, matched } = accumulateTierFromEntries(resolved.entries)
  const bands = resolveCityKolTierBands(resolved.filterCity)
  const filled = fillMissingTierPrices(rawAvgs, bands)
  return {
    tierAvgs: filled.avgs,
    filterCity: resolved.filterCity,
    filterPlatform: resolved.platform,
    totalEntries: resolved.totalEntries,
    matchedEntries: matched,
    priceSource: filled.priceSource,
    citySource: resolved.source,
  }
}

/** 从达人库条目按城市/平台统计各档位均价（无同城则全国本地生活回退） */
export function computeTalentLibraryTierAverages(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform?: RegistryTalentLibraryEntry['platform']
}): TalentLibraryPricingContext {
  const resolved = resolveTalentLibraryEntriesForCity({
    entries: params.entries,
    city: params.city,
    platform: params.platform,
  })
  return computeTalentLibraryTierAveragesFromResolved(resolved)
}

function tierCount(map: TierAllocationResult, tier: KolTierKey): number {
  return map[tier]
}

function setTierCount(map: TierAllocationResult, tier: KolTierKey, n: number): void {
  map[tier] = Math.max(0, n)
}

function estimatedCost(map: TierAllocationResult, prices: Record<KolTierKey, number>): number {
  return (
    map.v3 * prices.v3 +
    map.v4 * prices.v4 +
    map.v5 * prices.v5 +
    map.v5plus * prices.v5plus
  )
}

/**
 * 固定人数下按各档均价贪心升级：先全 V3，再用剩余预算逐级升档，尽量贴近总预算。
 */
export function allocateTierCountsByBudget(params: {
  budgetYuan: number
  targetHeadcount: number
  tierPrices: Record<KolTierKey, number>
}): TierAllocationResult {
  const budget = Math.max(0, Number(params.budgetYuan) || 0)
  const headcount = clampInt(Number(params.targetHeadcount) || 0, 1, 200)
  const prices = params.tierPrices

  const alloc: TierAllocationResult = {
    v3: headcount,
    v4: 0,
    v5: 0,
    v5plus: 0,
    estimatedCostYuan: 0,
    withinBudget: true,
  }

  const upgrades: { from: KolTierKey; to: KolTierKey; delta: number }[] = [
    { from: 'v3', to: 'v4', delta: prices.v4 - prices.v3 },
    { from: 'v4', to: 'v5', delta: prices.v5 - prices.v4 },
    { from: 'v5', to: 'v5plus', delta: prices.v5plus - prices.v5 },
  ]

  let spent = estimatedCost(alloc, prices)
  let remaining = budget - spent

  let guard = 0
  while (remaining > 0 && guard++ < headcount * 12) {
    let best: (typeof upgrades)[number] | null = null
    for (const u of upgrades) {
      if (u.delta <= 0) continue
      const count = tierCount(alloc, u.from)
      if (count <= 0 || u.delta > remaining) continue
      if (!best || u.delta > best.delta) best = u
    }
    if (!best) break
    setTierCount(alloc, best.from, tierCount(alloc, best.from) - 1)
    setTierCount(alloc, best.to, tierCount(alloc, best.to) + 1)
    remaining -= best.delta
    spent += best.delta
  }

  guard = 0
  while (spent > budget && guard++ < headcount * 12) {
    const downgrades = [...upgrades].reverse()
    let applied = false
    for (const d of downgrades) {
      if (tierCount(alloc, d.to) <= 0) continue
      setTierCount(alloc, d.to, tierCount(alloc, d.to) - 1)
      setTierCount(alloc, d.from, tierCount(alloc, d.from) + 1)
      spent -= d.delta
      applied = true
      break
    }
    if (!applied) break
  }

  alloc.estimatedCostYuan = Math.round(spent)
  alloc.withinBudget = spent <= budget
  return alloc
}

export function formatTierAvgSummary(ctx: TalentLibraryPricingContext): string {
  const parts: string[] = []
  for (const key of ['v3', 'v4', 'v5', 'v5plus'] as const) {
    const t = ctx.tierAvgs[key]
    const label = key === 'v5plus' ? 'V5+' : key.toUpperCase()
    const suffix = t.sampleCount > 0 ? `（库内${t.sampleCount}人）` : '（城市参考）'
    parts.push(`${label} ¥${t.avgYuan}/人${suffix}`)
  }
  const cityTag =
    ctx.citySource === 'nationwide_local_life'
      ? `全国本地生活回退·${ctx.filterCity || '全国'}`
      : ctx.filterCity || '全国'
  const scope =
    ctx.priceSource === 'library'
      ? `达人库均价（${cityTag}·${ctx.filterPlatform}，匹配${ctx.matchedEntries}条）`
      : `城市档位参考价（${ctx.filterCity || '默认'}）`
  return `${scope}：${parts.join('；')}`
}

export type NoviceAllocationFromLibrary = {
  v3: number
  v4: number
  v5: number
  v5plus: number
  notes?: string
  costHint?: string
  source: 'library' | 'fallback'
  pricingContext?: TalentLibraryPricingContext
}

/** 达人库均价 + 预算/人数 → 档位人数（服务端与本地网关共用） */
export function buildNoviceAllocationFromTalentLibrary(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  budgetYuan: number
  targetHeadcount: number
  feeType: 'tier' | 'fixed'
  platform?: RegistryTalentLibraryEntry['platform']
  industry?: string
}): NoviceAllocationFromLibrary {
  const budget = Math.max(0, Number(params.budgetYuan) || 0)
  const headcount = clampInt(Number(params.targetHeadcount) || 0, 1, 200)
  const city = params.city.trim()

  if (params.feeType === 'fixed') {
    const per = headcount > 0 ? Math.round(budget / headcount) : 0
    return {
      v3: 0,
      v4: 0,
      v5: 0,
      v5plus: headcount,
      notes: '一口价模式：人数全部计入高档位展示，人均成本由总预算均分。',
      costHint: `总预算约 ¥${budget.toLocaleString('zh-CN')}，招募 ${headcount} 人，人均约 ¥${per}/人。`,
      source: 'fallback',
    }
  }

  const resolved = resolveTalentLibraryEntriesForCity({
    entries: params.entries,
    city,
    platform: params.platform ?? '抖音',
  })
  const ctx = computeTalentLibraryTierAveragesFromResolved(resolved)
  const tierPrices: Record<KolTierKey, number> = {
    v3: ctx.tierAvgs.v3.avgYuan,
    v4: ctx.tierAvgs.v4.avgYuan,
    v5: ctx.tierAvgs.v5.avgYuan,
    v5plus: ctx.tierAvgs.v5plus.avgYuan,
  }

  const alloc = allocateTierCountsByBudget({
    budgetYuan: budget,
    targetHeadcount: headcount,
    tierPrices,
  })

  const avgLine = formatTierAvgSummary(ctx)
  const bands = resolveCityKolTierBands(city)
  const tierLine = formatCityTierBandsSummary(bands)
  const budgetNote = alloc.withinBudget
    ? `预估总成本约 ¥${alloc.estimatedCostYuan.toLocaleString('zh-CN')}（在预算 ¥${budget.toLocaleString('zh-CN')} 内）`
    : `预估总成本约 ¥${alloc.estimatedCostYuan.toLocaleString('zh-CN')}，高于预算 ¥${budget.toLocaleString('zh-CN')}（已尽量降档）`

  const industryNote = params.industry?.trim()
    ? `行业「${params.industry.trim()}」按毛利特性与平台佣金口径估算。`
    : ''

  const cityNote =
    resolved.source === 'city'
      ? `按门店城市「${city}」达人库（${resolved.cityMatchedCount} 人）各档均价拆分。`
      : city
        ? `达人库暂无「${city}」同城数据，已优先使用全国本地生活达人行情。`
        : '未解析到门店城市，已优先使用全国本地生活达人行情。'

  return {
    v3: alloc.v3,
    v4: alloc.v4,
    v5: alloc.v5,
    v5plus: alloc.v5plus,
    notes:
      (ctx.priceSource === 'library'
        ? `${cityNote}结合总预算、行业与目标人数自动拆分档位。`
        : `${cityNote}库内报价样本不足，已结合城市档位参考价估算。`) +
      (industryNote ? ` ${industryNote}` : ''),
    costHint: `${avgLine}。目标 ${headcount} 人；${budgetNote}。${tierLine}`,
    source: ctx.priceSource === 'library' ? 'library' : 'fallback',
    pricingContext: ctx,
  }
}
