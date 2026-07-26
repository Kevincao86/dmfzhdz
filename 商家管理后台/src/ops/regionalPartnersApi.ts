import { fetchOpsErpApi } from '../lib/opsErpApiBase'
import { readOpsSession } from './opsStaffAuth'

export type RegionalCity = { province: string; city: string }

export type RegionalPartnerModuleKey = 'dashboard' | 'merchants' | 'settlement' | 'materials'

export type RegionalPartner = {
  id: string
  companyName: string
  phone: string
  cities: RegionalCity[]
  permissions: RegionalPartnerModuleKey[]
  partnerShareRate: number
  platformShareRate: number
  status: 'active' | 'disabled'
  note: string
  createdAt: string
  updatedAt: string
}

export const REGIONAL_PARTNER_MODULES: Array<{ key: RegionalPartnerModuleKey; label: string }> = [
  { key: 'dashboard', label: '业绩看板' },
  { key: 'merchants', label: '名下商家' },
  { key: 'settlement', label: '结算明细' },
  { key: 'materials', label: '授权物料（占位）' },
]

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = readOpsSession()?.sessionToken?.trim()
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  return fetchOpsErpApi(path, init, { ecsOnly: true })
}

export async function apiListRegionalPartners(): Promise<
  { ok: true; partners: RegionalPartner[] } | { ok: false; error: string }
> {
  try {
    const res = await call('/api/meoo-ops-regional-partners', {
      method: 'GET',
      headers: authHeaders(),
    })
    const data = (await res.json()) as Record<string, unknown>
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.message ?? data.code ?? `http_${res.status}`) }
    }
    return { ok: true, partners: (data.partners as RegionalPartner[]) ?? [] }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function apiMutateRegionalPartner(
  body: Record<string, unknown>,
): Promise<{ ok: true; partner?: RegionalPartner } | { ok: false; error: string }> {
  try {
    const res = await call('/api/meoo-ops-regional-partners', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as Record<string, unknown>
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.message ?? data.code ?? `http_${res.status}`) }
    }
    return { ok: true, partner: data.partner as RegionalPartner | undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
