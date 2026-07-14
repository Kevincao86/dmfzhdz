import { merchantApiFetchUrls } from './merchantErpApiBase'
import { merchantApiAuthHeaders, resolveMerchantApiBearer } from './merchantApiAuth'
import type { PublicAffiliateSummary } from './distributionAffiliateApplyClient'
import type {
  AffiliatePortalSettlementRow,
  AffiliatePortalStats,
  AffiliatePortalWallet,
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
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}
