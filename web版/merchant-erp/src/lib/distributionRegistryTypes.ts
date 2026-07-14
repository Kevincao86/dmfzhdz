/** 渠道分销 · 注册表扩展类型（P1 提现 + P2 结算 + 佣金比例） */

export type DistributionProductLineRates = {
  partnerPoolRate?: number
  partnerShareOfPool?: number
  salespersonShareOfPool?: number
  individualPoolRate?: number
  maxCommissionMonths?: number
}

export type DistributionCommissionOverride = {
  erp?: DistributionProductLineRates
  xingxuan?: DistributionProductLineRates
  note?: string
  updatedAt?: string
  updatedBy?: string
}

export type RegistryDistributionPolicy = {
  enabled: boolean
  erp: DistributionProductLineRates
  xingxuan: DistributionProductLineRates
  settleDelayDays: number
  minPriceRateForCommission: number
  withdrawMinCents: number
  withdrawMaxCents: number
  withdrawMonthlyCapCents: number
  updatedAt?: string
}

export type RegistryDistributionAffiliate = {
  id: string
  refCode: string
  realName: string
  phone: string
  status: 'pending' | 'active' | 'disabled' | 'rejected'
  /** Supabase user id 或 mp:accountId，用于 cs/dr 登录态关联申请 */
  authUserId?: string
  commissionOverride?: DistributionCommissionOverride | null
  appliedAt: string
  approvedAt?: string
  applySource?: 'cs' | 'dr' | 'mp'
  note?: string
}

export type RegistryDistributionSalesperson = {
  id: string
  partnerTenantId: string
  realName: string
  phone: string
  employeeCode: string
  refCode: string
  status: 'active' | 'disabled'
  commissionOverride?: DistributionCommissionOverride | null
  createdAt: string
  note?: string
}

export type RegistryDistributionPartnerChannel = {
  partnerTenantId: string
  partnerName: string
  channelEnabled: boolean
  commissionOverride?: DistributionCommissionOverride | null
  salespersons: RegistryDistributionSalesperson[]
  updatedAt?: string
}

export type RegistryDistributionWallet = {
  ownerType: 'individual_affiliate' | 'partner_tenant'
  ownerId: string
  availableCents: number
  frozenCents: number
  withdrawnCents: number
  updatedAt: string
}

export type RegistryDistributionWithdrawRequest = {
  id: string
  ownerType: 'individual_affiliate' | 'partner_tenant'
  ownerId: string
  ownerLabel: string
  amountCents: number
  channel: 'manual_bank' | 'manual_alipay' | 'wechat' | 'alipay'
  payoutAccount?: Record<string, string>
  status: 'pending_review' | 'approved' | 'rejected' | 'paid' | 'failed'
  failReason?: string
  externalBillNo?: string
  opsNote?: string
  createdAt: string
  reviewedAt?: string
  paidAt?: string
}

export type RegistryDistributionSettlementBatch = {
  id: string
  payeeType: 'partner_tenant' | 'individual_affiliate'
  payeeId: string
  payeeLabel: string
  periodStart: string
  periodEnd: string
  totalCents: number
  orderCount: number
  status: 'draft' | 'confirmed' | 'paid'
  invoiceNo?: string
  bankReference?: string
  note?: string
  createdAt: string
  paidAt?: string
}

export const DEFAULT_DISTRIBUTION_POLICY: RegistryDistributionPolicy = {
  enabled: true,
  erp: {
    partnerPoolRate: 0.4,
    partnerShareOfPool: 0.4,
    salespersonShareOfPool: 0.6,
    individualPoolRate: 0.3,
    maxCommissionMonths: 12,
  },
  xingxuan: {
    partnerPoolRate: 0.35,
    partnerShareOfPool: 0.4,
    salespersonShareOfPool: 0.6,
    individualPoolRate: 0.25,
    maxCommissionMonths: 12,
  },
  settleDelayDays: 7,
  minPriceRateForCommission: 0.85,
  withdrawMinCents: 5000,
  withdrawMaxCents: 500000,
  withdrawMonthlyCapCents: 2000000,
}

export function mergeDistributionPolicy(
  raw?: RegistryDistributionPolicy | null,
): RegistryDistributionPolicy {
  const base = DEFAULT_DISTRIBUTION_POLICY
  if (!raw) return { ...base, erp: { ...base.erp }, xingxuan: { ...base.xingxuan } }
  return {
    ...base,
    ...raw,
    erp: { ...base.erp, ...(raw.erp ?? {}) },
    xingxuan: { ...base.xingxuan, ...(raw.xingxuan ?? {}) },
  }
}

export function effectiveAffiliateRates(
  policy: RegistryDistributionPolicy,
  override?: DistributionCommissionOverride | null,
): { erp: DistributionProductLineRates; xingxuan: DistributionProductLineRates } {
  return {
    erp: { ...policy.erp, ...(override?.erp ?? {}) },
    xingxuan: { ...policy.xingxuan, ...(override?.xingxuan ?? {}) },
  }
}

export function effectivePartnerRates(
  policy: RegistryDistributionPolicy,
  override?: DistributionCommissionOverride | null,
): { erp: DistributionProductLineRates; xingxuan: DistributionProductLineRates } {
  const erp = { ...policy.erp, ...(override?.erp ?? {}) }
  const xingxuan = { ...policy.xingxuan, ...(override?.xingxuan ?? {}) }
  delete erp.individualPoolRate
  delete xingxuan.individualPoolRate
  return { erp, xingxuan }
}
