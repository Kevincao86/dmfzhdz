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

export function mergeSalespersonDisplayRates(
  defaults: { erp: DistributionProductLineRates; xingxuan: DistributionProductLineRates },
  salespersonOverride?: DistributionCommissionOverride | null,
): { erp: DistributionProductLineRates; xingxuan: DistributionProductLineRates } {
  if (!salespersonOverride) return defaults
  return {
    erp: { ...defaults.erp, ...(salespersonOverride.erp ?? {}) },
    xingxuan: { ...defaults.xingxuan, ...(salespersonOverride.xingxuan ?? {}) },
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
  return Boolean(override.erp || override.xingxuan || override.note)
}
