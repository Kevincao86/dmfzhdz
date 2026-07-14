import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import { resolveMerchantApiBearer } from '../lib/merchantApiAuth'
import type {
  DistributionCommissionOverride,
  DistributionProductLineRates,
  RegistryDistributionSalesperson,
} from '../lib/distributionRegistryTypes'
import { buildDistributionPromoLinks } from '../lib/distributionRegistryCore'

export type PartnerSalesperson = RegistryDistributionSalesperson

export type PartnerCommissionContext = {
  policyEnabled: boolean
  channelOverride: DistributionCommissionOverride | null
  defaults: {
    erp: DistributionProductLineRates
    xingxuan: DistributionProductLineRates
  }
}

async function partnerApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = await resolveMerchantApiBearer()
  if (!token) throw new Error('请先登录')

  let lastErr = '请求失败'
  for (const url of merchantApiFetchUrls(path)) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers as Record<string, string> | undefined),
        },
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || json.ok === false) {
        lastErr = String(json.message || json.error || res.statusText || '请求失败')
        continue
      }
      return json as T
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export async function fetchPartnerSalespersons(): Promise<{
  partnerTenantId: string
  partnerName: string
  salespersons: PartnerSalesperson[]
  commissionContext: PartnerCommissionContext
}> {
  const data = await partnerApiFetch<{
    partnerTenantId: string
    partnerName: string
    salespersons: PartnerSalesperson[]
    commissionContext: PartnerCommissionContext
  }>('/api/meoo-partner-salespersons')
  return {
    partnerTenantId: data.partnerTenantId ?? '',
    partnerName: data.partnerName ?? '',
    salespersons: data.salespersons ?? [],
    commissionContext: data.commissionContext ?? {
      policyEnabled: true,
      channelOverride: null,
      defaults: { erp: {}, xingxuan: {} },
    },
  }
}

export async function upsertPartnerSalesperson(input: {
  id?: string
  realName: string
  phone: string
  employeeCode: string
  status?: 'active' | 'disabled'
  note?: string
}): Promise<PartnerSalesperson> {
  const data = await partnerApiFetch<{ salesperson: PartnerSalesperson }>('/api/meoo-partner-salespersons', {
    method: 'POST',
    body: JSON.stringify({ action: 'upsert', ...input }),
  })
  if (!data.salesperson) throw new Error('保存失败')
  return data.salesperson
}

export async function patchPartnerSalespersonCommission(input: {
  salespersonId: string
  commissionOverride: DistributionCommissionOverride | null
}): Promise<{
  salespersons: PartnerSalesperson[]
  commissionContext: PartnerCommissionContext
}> {
  const data = await partnerApiFetch<{
    salespersons: PartnerSalesperson[]
    commissionContext: PartnerCommissionContext
  }>('/api/meoo-partner-salespersons', {
    method: 'POST',
    body: JSON.stringify({
      action: 'patch_commission',
      salespersonId: input.salespersonId,
      commissionOverride: input.commissionOverride,
    }),
  })
  return {
    salespersons: data.salespersons ?? [],
    commissionContext: data.commissionContext ?? {
      policyEnabled: true,
      channelOverride: null,
      defaults: { erp: {}, xingxuan: {} },
    },
  }
}

export async function batchPatchPartnerSalespersonCommission(input: {
  salespersonIds?: string[]
  applyToAll?: boolean
  commissionOverride: DistributionCommissionOverride | null
}): Promise<{
  updatedCount: number
  salespersons: PartnerSalesperson[]
  commissionContext: PartnerCommissionContext
}> {
  const data = await partnerApiFetch<{
    updatedCount: number
    salespersons: PartnerSalesperson[]
    commissionContext: PartnerCommissionContext
  }>('/api/meoo-partner-salespersons', {
    method: 'POST',
    body: JSON.stringify({
      action: 'batch_patch_commission',
      salespersonIds: input.salespersonIds,
      applyToAll: input.applyToAll,
      commissionOverride: input.commissionOverride,
    }),
  })
  return {
    updatedCount: typeof data.updatedCount === 'number' ? data.updatedCount : 0,
    salespersons: data.salespersons ?? [],
    commissionContext: data.commissionContext ?? {
      policyEnabled: true,
      channelOverride: null,
      defaults: { erp: {}, xingxuan: {} },
    },
  }
}

export function buildPartnerPromoLinks(refCode: string): {
  cs: string
  drPr: string
  drTalent: string
  mpPath: string
} {
  return buildDistributionPromoLinks(refCode)
}
