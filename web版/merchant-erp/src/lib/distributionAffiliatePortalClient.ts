import { merchantApiFetchUrls } from './merchantErpApiBase'
import { merchantApiAuthHeaders, resolveMerchantApiBearer } from './merchantApiAuth'
import type { PublicAffiliateSummary } from './distributionAffiliateApplyClient'
import type {
  AffiliatePortalSettlementRow,
  AffiliatePortalStats,
  AffiliatePortalWallet,
  AffiliatePortalWithdrawRow,
  AffiliateWithdrawGate,
} from './distributionRegistryCore'
import type {
  PartnerDistributionAttributionRow,
  SalespersonPortalStats,
} from './distributionAttributionCore'

export type AffiliatePromoLinks = {
  cs: string
  drPr: string
  drTalent: string
  mpPath: string
}

export type AffiliatePortalPayload = {
  affiliate: PublicAffiliateSummary | null
  wallet: AffiliatePortalWallet | null
  stats: AffiliatePortalStats | null
  settlements: AffiliatePortalSettlementRow[]
  promoLinks: AffiliatePromoLinks | null
  attributionStats: SalespersonPortalStats | null
  attributions: PartnerDistributionAttributionRow[]
  withdrawGate: AffiliateWithdrawGate | null
  withdrawRequests: AffiliatePortalWithdrawRow[]
}

export function formatCentsYuan(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2)
}

export async function fetchAffiliatePortal(): Promise<AffiliatePortalPayload> {
  const { token, source } = await resolveMerchantApiBearer()
  if (!token) throw new Error('请先登录')

  const headers = merchantApiAuthHeaders(token, source)
  let lastErr = '请求失败'
  for (const url of merchantApiFetchUrls('/api/meoo-distribution-affiliate-portal')) {
    try {
      const res = await fetch(url, { method: 'GET', headers })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || json.ok === false) {
        lastErr = String(json.message || json.error || res.statusText || '请求失败')
        if (res.status !== 404) break
        continue
      }
      return {
        affiliate: (json.affiliate as PublicAffiliateSummary | null) ?? null,
        wallet: (json.wallet as AffiliatePortalWallet | null) ?? null,
        stats: (json.stats as AffiliatePortalStats | null) ?? null,
        settlements: (json.settlements as AffiliatePortalSettlementRow[]) ?? [],
        promoLinks: (json.promoLinks as AffiliatePromoLinks | null) ?? null,
        attributionStats: (json.attributionStats as SalespersonPortalStats | null) ?? null,
        attributions: (json.attributions as PartnerDistributionAttributionRow[]) ?? [],
        withdrawGate: (json.withdrawGate as AffiliateWithdrawGate | null) ?? null,
        withdrawRequests: (json.withdrawRequests as AffiliatePortalWithdrawRow[]) ?? [],
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export async function submitAffiliateWithdraw(amountCents: number): Promise<void> {
  const { token, source } = await resolveMerchantApiBearer()
  if (!token) throw new Error('请先登录')
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('请输入有效提现金额')

  const headers = {
    ...merchantApiAuthHeaders(token, source),
    'Content-Type': 'application/json',
  }
  let lastErr = '提现申请失败'
  for (const url of merchantApiFetchUrls('/api/meoo-distribution-affiliate-portal')) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'withdraw', amountCents: Math.floor(amountCents) }),
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || json.ok === false) {
        lastErr = String(json.message || json.error || res.statusText || '提现申请失败')
        if (res.status !== 404) break
        continue
      }
      return
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export function withdrawRequestStatusLabel(status: string): string {
  switch (status) {
    case 'pending_review':
      return '待审核'
    case 'approved':
      return '已通过'
    case 'rejected':
      return '已拒绝'
    case 'paid':
      return '已打款'
    case 'failed':
      return '打款失败'
    default:
      return status
  }
}
