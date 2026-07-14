import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'
import { requireOpsModuleEdit } from './opsStaffAuth.js'
import type {
  DistributionCommissionOverride,
  RegistryDistributionAffiliate,
  RegistryDistributionPartnerChannel,
  RegistryDistributionPolicy,
  RegistryDistributionSettlementBatch,
  RegistryDistributionWithdrawRequest,
} from '../meooRegistryShared/distributionRegistryTypes.js'
import { fetchRegistry, type RegistryFile } from './opsRegistryApi.js'

export type {
  DistributionCommissionOverride,
  RegistryDistributionAffiliate,
  RegistryDistributionPartnerChannel,
  RegistryDistributionPolicy,
  RegistryDistributionSettlementBatch,
  RegistryDistributionWithdrawRequest,
}

async function postDistribution(body: Record<string, unknown>): Promise<{
  ok: boolean
  error?: string
  [key: string]: unknown
}> {
  const denied = requireOpsModuleEdit('distribution')
  if (denied) return { ok: false, error: denied }
  const paths = ['/api/meoo-ops-distribution-registry', '/api/ops-sync/distribution-registry']
  let last: Record<string, unknown> = { ok: false, error: 'request_failed' }
  for (const path of paths) {
    const res = await fetchOpsErpApi(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok) return { ok: true, ...j }
    last = j
    if (res.status !== 404) break
  }
  return { ok: false, error: String(last.error || 'request_failed') }
}

export async function loadDistributionSnapshot(): Promise<{
  policy: RegistryDistributionPolicy
  affiliates: RegistryDistributionAffiliate[]
  partners: RegistryDistributionPartnerChannel[]
  withdrawRequests: RegistryDistributionWithdrawRequest[]
  settlementBatches: RegistryDistributionSettlementBatch[]
}> {
  const reg: RegistryFile = await fetchRegistry()
  return {
    policy: reg.distributionPolicy ?? {
      enabled: true,
      erp: {},
      xingxuan: {},
      settleDelayDays: 7,
      minPriceRateForCommission: 0.85,
      withdrawMinCents: 5000,
      withdrawMaxCents: 500000,
      withdrawMonthlyCapCents: 2000000,
    },
    affiliates: reg.distributionAffiliates ?? [],
    partners: reg.distributionPartnerChannels ?? [],
    withdrawRequests: reg.distributionWithdrawRequests ?? [],
    settlementBatches: reg.distributionSettlementBatches ?? [],
  }
}

export async function saveDistributionPolicy(
  policy: Partial<RegistryDistributionPolicy>,
): Promise<{ ok: boolean; error?: string }> {
  const j = await postDistribution({ action: 'patch_policy', ...policy })
  return { ok: j.ok !== false, error: j.error as string | undefined }
}

export async function patchAffiliateCommission(
  id: string,
  commissionOverride: DistributionCommissionOverride | null,
): Promise<{ ok: boolean; error?: string }> {
  const j = await postDistribution({ action: 'patch_affiliate_commission', id, commissionOverride })
  return { ok: j.ok !== false, error: j.error as string | undefined }
}

export async function batchPatchAffiliateCommission(
  ids: string[],
  commissionOverride: DistributionCommissionOverride | null,
): Promise<{ ok: boolean; updatedCount?: number; error?: string }> {
  const j = await postDistribution({ action: 'batch_patch_affiliate_commission', ids, commissionOverride })
  return {
    ok: j.ok !== false,
    updatedCount: typeof j.updatedCount === 'number' ? j.updatedCount : undefined,
    error: j.error as string | undefined,
  }
}

export async function patchPartnerCommission(
  partnerTenantId: string,
  body: {
    partnerName?: string
    channelEnabled?: boolean
    commissionOverride?: DistributionCommissionOverride | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const j = await postDistribution({
    action: 'patch_partner_commission',
    partnerTenantId,
    ...body,
  })
  return { ok: j.ok !== false, error: j.error as string | undefined }
}

export async function batchPatchPartnerCommission(
  partnerTenantIds: string[],
  commissionOverride: DistributionCommissionOverride | null,
): Promise<{ ok: boolean; updatedCount?: number; error?: string }> {
  const j = await postDistribution({
    action: 'batch_patch_partner_commission',
    partnerTenantIds,
    commissionOverride,
  })
  return {
    ok: j.ok !== false,
    updatedCount: typeof j.updatedCount === 'number' ? j.updatedCount : undefined,
    error: j.error as string | undefined,
  }
}

export async function patchSalespersonCommission(
  partnerTenantId: string,
  salespersonId: string,
  commissionOverride: DistributionCommissionOverride | null,
): Promise<{ ok: boolean; error?: string }> {
  const j = await postDistribution({
    action: 'patch_salesperson_commission',
    partnerTenantId,
    salespersonId,
    commissionOverride,
  })
  return { ok: j.ok !== false, error: j.error as string | undefined }
}

export async function batchPatchSalespersonCommission(
  partnerTenantId: string,
  salespersonIds: string[],
  commissionOverride: DistributionCommissionOverride | null,
): Promise<{ ok: boolean; updatedCount?: number; error?: string }> {
  const j = await postDistribution({
    action: 'batch_patch_salesperson_commission',
    partnerTenantId,
    salespersonIds,
    commissionOverride,
  })
  return {
    ok: j.ok !== false,
    updatedCount: typeof j.updatedCount === 'number' ? j.updatedCount : undefined,
    error: j.error as string | undefined,
  }
}

export async function patchAffiliateStatus(
  id: string,
  status: 'pending' | 'active' | 'rejected' | 'disabled',
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const j = await postDistribution({ action: 'patch_affiliate_status', id, status, note })
  return { ok: j.ok !== false, error: j.error as string | undefined }
}

export async function withdrawAction(
  requestId: string,
  action: 'approve' | 'reject' | 'mark_paid',
  body: Record<string, string> = {},
): Promise<{ ok: boolean; error?: string }> {
  const j = await postDistribution({
    action: `withdraw_${action}`,
    requestId,
    ...body,
  })
  return { ok: j.ok !== false, error: j.error as string | undefined }
}

export async function createSettlementBatch(body: {
  payeeType: 'partner_tenant' | 'individual_affiliate'
  payeeId: string
  payeeLabel: string
  periodStart: string
  periodEnd: string
  totalCents: number
  orderCount?: number
  note?: string
}): Promise<{ ok: boolean; error?: string }> {
  const j = await postDistribution({ action: 'settlement_batch_create', ...body })
  return { ok: j.ok !== false, error: j.error as string | undefined }
}

export async function settlementBatchAction(
  batchId: string,
  action: 'confirm' | 'mark_paid',
  body: Record<string, string> = {},
): Promise<{ ok: boolean; error?: string }> {
  const j = await postDistribution({
    action: action === 'confirm' ? 'settlement_batch_confirm' : 'settlement_batch_mark_paid',
    batchId,
    ...body,
  })
  return { ok: j.ok !== false, error: j.error as string | undefined }
}

export function pct(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Math.round(n * 1000) / 10}%`
}

export function yuanFromCents(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
