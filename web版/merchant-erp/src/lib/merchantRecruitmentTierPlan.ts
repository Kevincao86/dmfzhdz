import {
  formatCityTierBandsSummary,
  resolveCityKolTierBands,
  type CityKolTierBands,
  type KolTierBand,
} from './recruitmentCityTierPricing'
import type { KolTierStrategy } from './opsRegistryTypes'

export type KolTierKey = 'v3' | 'v4' | 'v5' | 'v5plus'

export type RecruitmentTierPlan = {
  feeType: 'tier' | 'fixed'
  totalHeadcount: number
  budgetYuan: number
  city: string
  tiers: Partial<Record<KolTierKey, { count: number; unitPriceYuan: number }>>
  fixedPriceYuan?: number
  strategy?: KolTierStrategy
  source: 'library' | 'ai' | 'fallback'
  costHint?: string
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

function bandMid(b: KolTierBand): number {
  if (b.max == null) return Math.max(b.min, b.min + 80)
  return Math.round((b.min + b.max) / 2)
}

function allocateCountsForTarget(
  total: number,
  strategy: KolTierStrategy,
): Pick<RecruitmentTierPlan['tiers'], 'v3' | 'v4' | 'v5' | 'v5plus'> {
  const w =
    strategy === 'more_v3'
      ? ([0.42, 0.32, 0.16, 0.1] as const)
      : strategy === 'more_v4'
        ? ([0.18, 0.42, 0.22, 0.18] as const)
        : ([0.12, 0.18, 0.3, 0.4] as const)
  let v3 = Math.round(total * w[0])
  let v4 = Math.round(total * w[1])
  let v5 = Math.round(total * w[2])
  let v5plus = Math.round(total * w[3])
  let gap = total - (v3 + v4 + v5 + v5plus)
  let guard = 0
  while (gap !== 0 && guard++ < 64) {
    if (gap > 0) {
      v5plus += 1
      gap -= 1
    } else if (v3 > 0) {
      v3 -= 1
      gap += 1
    } else if (v4 > 0) {
      v4 -= 1
      gap += 1
    } else if (v5 > 0) {
      v5 -= 1
      gap += 1
    } else if (v5plus > 0) {
      v5plus -= 1
      gap += 1
    } else break
  }
  return {
    v3: { count: Math.max(0, v3), unitPriceYuan: 0 },
    v4: { count: Math.max(0, v4), unitPriceYuan: 0 },
    v5: { count: Math.max(0, v5), unitPriceYuan: 0 },
    v5plus: { count: Math.max(0, v5plus), unitPriceYuan: 0 },
  }
}

/** 按预算 + 目标人数 + 城市档位库，生成阶梯招募方案（供商家确认后流入星选） */
export function buildRecruitmentTierPlan(params: {
  budgetYuan: number
  targetHeadcount: number
  city: string
  strategy?: KolTierStrategy
  feeType: 'tier' | 'fixed'
  cityTierBands?: CityKolTierBands
  source?: 'library' | 'ai' | 'fallback'
  allocation?: { v3: number; v4: number; v5: number; v5plus: number }
}): RecruitmentTierPlan {
  const budget = Math.max(0, Number(params.budgetYuan) || 0)
  const total = clampInt(Number(params.targetHeadcount) || 0, 1, 200)
  const bands = params.cityTierBands ?? resolveCityKolTierBands(params.city)
  const tierLine = formatCityTierBandsSummary(bands)

  if (params.feeType === 'fixed') {
    const fixed = total > 0 ? Math.round(budget / total) : 0
    return {
      feeType: 'fixed',
      totalHeadcount: total,
      budgetYuan: budget,
      city: params.city.trim(),
      tiers: {},
      fixedPriceYuan: fixed,
      source: params.source ?? 'fallback',
      costHint: `一口价约 ¥${fixed}/人；总预算 ¥${budget.toLocaleString('zh-CN')}，招募 ${total} 人。${tierLine}`,
    }
  }

  const fromAllocation = params.allocation
  const raw = fromAllocation
    ? {
        v3: { count: fromAllocation.v3, unitPriceYuan: 0 },
        v4: { count: fromAllocation.v4, unitPriceYuan: 0 },
        v5: { count: fromAllocation.v5, unitPriceYuan: 0 },
        v5plus: { count: fromAllocation.v5plus, unitPriceYuan: 0 },
      }
    : allocateCountsForTarget(total, params.strategy ?? 'more_v4')
  const tiers: RecruitmentTierPlan['tiers'] = {
    v3: { count: raw.v3!.count, unitPriceYuan: bandMid(bands.v3) },
    v4: { count: raw.v4!.count, unitPriceYuan: bandMid(bands.v4) },
    v5: { count: raw.v5!.count, unitPriceYuan: bandMid(bands.v5) },
    v5plus: { count: raw.v5plus!.count, unitPriceYuan: bandMid(bands.v5plus) },
  }
  const estCost =
    (tiers.v3?.count ?? 0) * (tiers.v3?.unitPriceYuan ?? 0) +
    (tiers.v4?.count ?? 0) * (tiers.v4?.unitPriceYuan ?? 0) +
    (tiers.v5?.count ?? 0) * (tiers.v5?.unitPriceYuan ?? 0) +
    (tiers.v5plus?.count ?? 0) * (tiers.v5plus?.unitPriceYuan ?? 0)

  return {
    feeType: 'tier',
    totalHeadcount: total,
    budgetYuan: budget,
    city: params.city.trim(),
    tiers,
    source: params.source ?? 'fallback',
    costHint: `${tierLine}；预估档位成本约 ¥${estCost.toLocaleString('zh-CN')}（参考同城达人库，非承诺报价）。`,
  }
}

export function tierPlanSummaryLines(plan: RecruitmentTierPlan): string[] {
  if (plan.feeType === 'fixed') {
    return [
      `费用模式：一口价`,
      `招募人数：${plan.totalHeadcount}`,
      `一口价：约 ¥${plan.fixedPriceYuan ?? 0}/人`,
      `总预算：¥${plan.budgetYuan}`,
      `城市：${plan.city || '—'}`,
    ]
  }
  const lines = [
    `费用模式：阶梯档位`,
    `招募人数：${plan.totalHeadcount}`,
    `总预算：¥${plan.budgetYuan}`,
    `城市：${plan.city || '—'}`,
  ]
  for (const key of ['v3', 'v4', 'v5', 'v5plus'] as KolTierKey[]) {
    const t = plan.tiers[key]
    if (t && t.count > 0) {
      const label = key === 'v5plus' ? 'V5+' : key.toUpperCase()
      lines.push(`${label}：${t.count} 人 · 参考单价约 ¥${t.unitPriceYuan}/人`)
    }
  }
  return lines
}

export function inferKolTierFromApplicant(a: {
  kolTier?: KolTierKey
  douyinSalesLevel?: string
  followers?: number
}): KolTierKey {
  if (a.kolTier === 'v3' || a.kolTier === 'v4' || a.kolTier === 'v5' || a.kolTier === 'v5plus') {
    return a.kolTier
  }
  const level = String(a.douyinSalesLevel || '').trim()
  const fans = Number(a.followers) || 0
  if (/5\+|5以上|V5\+|Lv5\+|五星/i.test(level) || fans >= 500_000) return 'v5plus'
  if (/^5|V5|Lv5|五星|五级/i.test(level) || fans >= 100_000) return 'v5'
  if (/^4|V4|Lv4|四星|四级/i.test(level) || fans >= 10_000) return 'v4'
  return 'v3'
}

export function kolTierLabel(t: KolTierKey): string {
  if (t === 'v5plus') return 'V5+'
  return t.toUpperCase()
}
