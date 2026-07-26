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
}

export type PartnerSession = {
  partnerId: string
  phone: string
  companyName: string
  permissions: RegionalPartnerModuleKey[]
  cities: RegionalCity[]
  partnerShareRate: number
  platformShareRate: number
  loginAt: string
  sessionToken: string
}

const SESSION_KEY = 'meoo_regional_partner_session_v1'

export function apiBase(): string {
  const fromEnv = (import.meta.env.VITE_ERP_AUTH_API_BASE ?? '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (import.meta.env.PROD) return 'https://mofangdianai.com/erp-api'
  return '/erp-api'
}

function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const rel = p.replace(/^\/api\//, '').replace(/^\//, '')
  return `${apiBase()}/${rel}`
}

export function readSession(): PartnerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as PartnerSession
    if (!o?.sessionToken || !o.partnerId) return null
    return o
  } catch {
    return null
  }
}

export function writeSession(s: PartnerSession | null): void {
  if (!s) {
    localStorage.removeItem(SESSION_KEY)
    return
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(apiUrl(path), init)
    const data = (await res.json()) as Record<string, unknown>
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        status: res.status,
        error: String(data.message ?? data.code ?? `http_${res.status}`),
      }
    }
    return { ok: true, data: data as T }
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = (token ?? readSession()?.sessionToken ?? '').trim()
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

export async function login(phone: string, password: string) {
  const r = await request<{
    ok: true
    sessionToken: string
    session: Omit<PartnerSession, 'sessionToken'>
    partner: RegionalPartner
  }>('/api/meoo-regional-partner-login', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ phone, password }),
  })
  if (!r.ok) return r
  const session: PartnerSession = {
    ...r.data.session,
    sessionToken: r.data.sessionToken,
  }
  writeSession(session)
  return { ok: true as const, session, partner: r.data.partner }
}

export async function fetchMe() {
  return request<{ ok: true; partner: RegionalPartner }>('/api/meoo-regional-partner-me', {
    method: 'GET',
    headers: authHeaders(),
  })
}

export async function fetchDashboard() {
  return request<{
    ok: true
    dashboard: {
      cities: RegionalCity[]
      merchantCount: number
      activeMerchantCount: number
      confirmedOrderCount: number
      grossCents: number
      partnerShareCents: number
      platformShareCents: number
      partnerShareRate: number
      platformShareRate: number
    }
  }>('/api/meoo-regional-partner-dashboard', {
    method: 'GET',
    headers: authHeaders(),
  })
}

export type RegionalMerchantRow = {
  id: string
  name: string
  edition: string
  editionLabel: string
  accountStatus: string
  membershipPlan: string
  opsGiftDays: number
  serviceExpireAt: string | null
  registerProvince: string | null
  registerCity: string | null
  attributionCity: string | null
  city: string | null
  createdAt: string
  openStatus: string
  inScope?: boolean
  canClaim?: boolean
}

export async function fetchMerchants(keyword?: string) {
  const q = keyword?.trim()
  const path = q
    ? `/api/meoo-regional-partner-merchants?q=${encodeURIComponent(q)}`
    : '/api/meoo-regional-partner-merchants'
  return request<{
    ok: true
    cities?: RegionalCity[]
    merchants: RegionalMerchantRow[]
  }>(path, {
    method: 'GET',
    headers: authHeaders(),
  })
}

export async function mutateMerchant(body: Record<string, unknown>) {
  return request<{ ok: true; merchant?: RegionalMerchantRow }>(
    '/api/meoo-regional-partner-merchants',
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    },
  )
}

export async function fetchSettlement() {
  return request<{
    ok: true
    summary: {
      grossCents: number
      partnerShareCents: number
      platformShareCents: number
      partnerShareRate: number
      platformShareRate: number
      confirmedOrderCount: number
    }
    lines: Array<{
      orderId: string
      tenantId: string
      merchantName: string
      amountCents: number
      partnerShareCents: number
      platformShareCents: number
      confirmedAt: string | null
    }>
  }>('/api/meoo-regional-partner-settlement', {
    method: 'GET',
    headers: authHeaders(),
  })
}

export function yuan(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
