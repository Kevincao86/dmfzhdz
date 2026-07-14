import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import { resolveMerchantApiBearer } from '../lib/merchantApiAuth'
import type { RegistryDistributionSalesperson } from '../lib/distributionRegistryTypes'

export type PartnerSalesperson = RegistryDistributionSalesperson

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
}> {
  const data = await partnerApiFetch<{
    partnerTenantId: string
    partnerName: string
    salespersons: PartnerSalesperson[]
  }>('/api/meoo-partner-salespersons')
  return {
    partnerTenantId: data.partnerTenantId ?? '',
    partnerName: data.partnerName ?? '',
    salespersons: data.salespersons ?? [],
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
    body: JSON.stringify(input),
  })
  if (!data.salesperson) throw new Error('保存失败')
  return data.salesperson
}

export function buildPartnerPromoLinks(refCode: string): {
  cs: string
  drPr: string
  drTalent: string
  mpPath: string
} {
  const code = encodeURIComponent(refCode.trim())
  return {
    cs: `https://cs.mofangdianai.com/register?ref=${code}`,
    drPr: `https://dr.mofangdianai.com/register?ref=${code}&role=pr`,
    drTalent: `https://dr.mofangdianai.com/register?ref=${code}&role=talent`,
    mpPath: `/pages/welcome/welcome?ref=${refCode.trim()}`,
  }
}
