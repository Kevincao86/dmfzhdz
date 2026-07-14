import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import { resolveMerchantApiBearer } from '../lib/merchantApiAuth'
import type {
  PartnerDistributionAttributionRow,
  PartnerDistributionStats,
  PartnerSalespersonStatsRow,
  SalespersonPortalStats,
} from '../lib/distributionAttributionCore'

export type { PartnerDistributionStats, PartnerSalespersonStatsRow, PartnerDistributionAttributionRow, SalespersonPortalStats }

async function partnerApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = await resolveMerchantApiBearer()
  if (!token) throw new Error('请先登录')

  let lastErr = '请求失败'
  for (const url of merchantErpApiCandidates(path)) {
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

export async function fetchPartnerDistributionStats(): Promise<PartnerDistributionStats> {
  const data = await partnerApiFetch<{ stats: PartnerDistributionStats }>(
    '/api/meoo-partner-distribution-stats',
  )
  return data.stats
}

export type SalespersonPortalResponse = {
  ok: boolean
  partnerName?: string
  salesperson?: {
    id: string
    realName: string
    refCode: string
    phone: string
    status: string
  }
  promoLinks?: {
    cs: string
    drPr: string
    drTalent: string
    mpPath: string
  }
  stats?: SalespersonPortalStats
  attributions?: PartnerDistributionAttributionRow[]
  message?: string
  error?: string
}

export async function fetchSalespersonPortalBySms(body: {
  phone: string
  smsCode: string
}): Promise<SalespersonPortalResponse> {
  let lastErr = '请求失败'
  for (const url of merchantErpApiCandidates('/api/meoo-partner-salesperson-portal')) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as SalespersonPortalResponse
      if (!res.ok || json.ok === false) {
        lastErr = String(json.message || json.error || res.statusText || '请求失败')
        continue
      }
      return json
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, error: 'network_error', message: lastErr }
}

export function formatCentsYuan(cents: number): string {
  const yuan = (Math.max(0, cents) / 100).toFixed(2)
  return `¥${yuan}`
}
