import type {
  DistributionCommissionOverride,
  DistributionProductLineRates,
  RegistryDistributionPolicy,
} from './distributionRegistryTypes.js'
import { effectivePartnerRates, mergeDistributionPolicy } from './distributionRegistryTypes.js'

export function formatRatePct(rate?: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${Math.round(rate * 1000) / 10}%`
}

/** 服务商 fws 不可改分润池占实收，仅可改池内服务商/分销员占比 */
const PARTNER_LOCKED_RATE_KEYS = ['partnerPoolRate', 'individualPoolRate', 'maxCommissionMonths'] as const

function stripPartnerLockedRates(
  rates?: DistributionProductLineRates,
): DistributionProductLineRates | undefined {
  if (!rates) return undefined
  const out = { ...rates }
  for (const key of PARTNER_LOCKED_RATE_KEYS) delete out[key]
  return Object.keys(out).length ? out : undefined
}

export function sanitizePartnerSalespersonCommissionOverride(
  raw: DistributionCommissionOverride | null,
): DistributionCommissionOverride | null {
  if (raw === null) return null
  const erp = stripPartnerLockedRates(raw.erp)
  const xingxuan = stripPartnerLockedRates(raw.xingxuan)
  const note = String(raw.note ?? '').trim()
  if (!erp && !xingxuan && !note) return null
  return {
    ...(erp ? { erp } : {}),
    ...(xingxuan ? { xingxuan } : {}),
    ...(note ? { note } : {}),
  }
}

export function mergeSalespersonDisplayRates(
  defaults: { erp: DistributionProductLineRates; xingxuan: DistributionProductLineRates },
  salespersonOverride?: DistributionCommissionOverride | null,
): { erp: DistributionProductLineRates; xingxuan: DistributionProductLineRates } {
  if (!salespersonOverride) return defaults
  const erpOv = stripPartnerLockedRates(salespersonOverride.erp)
  const xxOv = stripPartnerLockedRates(salespersonOverride.xingxuan)
  return {
    erp: { ...defaults.erp, ...(erpOv ?? {}) },
    xingxuan: { ...defaults.xingxuan, ...(xxOv ?? {}) },
  }
}

export function effectiveSalespersonCommissionRates(
  policy: RegistryDistributionPolicy,
  channelOverride?: DistributionCommissionOverride | null,
  salespersonOverride?: DistributionCommissionOverride | null,
): { erp: DistributionProductLineRates; xingxuan: DistributionProductLineRates } {
  const merged = mergeDistributionPolicy(policy)
  const base = effectivePartnerRates(merged, channelOverride ?? null)
  if (!salespersonOverride) return base
  return effectivePartnerRates(merged, {
    erp: { ...base.erp, ...(salespersonOverride.erp ?? {}) },
    xingxuan: { ...base.xingxuan, ...(salespersonOverride.xingxuan ?? {}) },
    note: salespersonOverride.note,
  })
}

export function salespersonRatesSummary(
  rates: { erp: DistributionProductLineRates; xingxuan: DistributionProductLineRates },
): { erpSalesPool: string; xingxuanSalesPool: string; erpSalesPaid: string; xingxuanSalesPaid: string } {
  const erpPool = rates.erp.partnerPoolRate ?? 0
  const xxPool = rates.xingxuan.partnerPoolRate ?? 0
  const erpSales = rates.erp.salespersonShareOfPool ?? 0
  const xxSales = rates.xingxuan.salespersonShareOfPool ?? 0
  return {
    erpSalesPool: formatRatePct(erpSales),
    xingxuanSalesPool: formatRatePct(xxSales),
    erpSalesPaid: formatRatePct(erpPool * erpSales),
    xingxuanSalesPaid: formatRatePct(xxPool * xxSales),
  }
}

export function hasCommissionOverride(override?: DistributionCommissionOverride | null): boolean {
  if (!override) return false
  const sanitized = sanitizePartnerSalespersonCommissionOverride(override)
  return Boolean(sanitized)
}
