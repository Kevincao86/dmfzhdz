import { inferKolTierFromApplicant, type KolTierKey } from './merchantRecruitmentTierPlan'
import {
  formatCityTierBandsSummary,
  resolveCityKolTierBands,
  type CityKolTierBands,
  type KolTierBand,
} from './recruitmentCityTierPricing'
import type { RegistryTalentLibraryEntry } from './opsRegistryTypes'

export type TierAvgPrices = Record<KolTierKey, { avgYuan: number; sampleCount: number }>

export type TalentLibraryPricingContext = {
  tierAvgs: TierAvgPrices
  filterCity: string
  filterPlatform: string
  totalEntries: number
  matchedEntries: number
  priceSource: 'library' | 'city_bands'
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

/** 从达人库条目按城市/平台统计各档位均价 */
export function computeTalentLibraryTierAverages(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform?: RegistryTalentLibraryEntry['platform']
}): TalentLibraryPricingContext {
  const city = params.city.trim()
  const platform = params.platform ?? '抖音'
  const buckets: Record<KolTierKey, number[]> = { v3: [], v4: [], v5: [], v5plus: [] }
  const entries = Array.isArray(params.entries) ? params.entries : []
  let matched = 0

  for (const entry of entries) {
    if (entry.platform !== platform) continue
    if (!cityMatchesTalentEntry(entry.city, city)) continue
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

  const bands = resolveCityKolTierBands(city)
  const filled = fillMissingTierPrices(rawAvgs, bands)

  return {
    tierAvgs: filled.avgs,
    filterCity: city,
    filterPlatform: platform,
    totalEntries: entries.length,
    matchedEntries: matched,
    priceSource: filled.priceSource,
  }
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
  const scope =
    ctx.priceSource === 'library'
      ? `达人库均价（${ctx.filterCity || '全国'}·${ctx.filterPlatform}，匹配${ctx.matchedEntries}条）`
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

  const ctx = computeTalentLibraryTierAverages({
    entries: params.entries,
    city,
    platform: params.platform ?? '抖音',
  })
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

  return {
    v3: alloc.v3,
    v4: alloc.v4,
    v5: alloc.v5,
    v5plus: alloc.v5plus,
    notes:
      (ctx.priceSource === 'library'
        ? '按星选达人库各档位平均报价，结合总预算、行业与目标人数自动拆分档位。'
        : '达人库同城样本不足，已结合城市档位参考价估算。') +
      (industryNote ? ` ${industryNote}` : ''),
    costHint: `${avgLine}。目标 ${headcount} 人；${budgetNote}。${tierLine}`,
    source: ctx.priceSource === 'library' ? 'library' : 'fallback',
    pricingContext: ctx,
  }
}
