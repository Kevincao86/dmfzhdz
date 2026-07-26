import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  bearerTokenFromAuthHeader,
  requireSuperAdminSession,
  verifyOpsSessionToken,
  type OpsSessionPayload,
} from './opsStaffAccountsBackend.js'

export const REGIONAL_PARTNER_MODULE_KEYS = [
  'dashboard',
  'merchants',
  'settlement',
  'materials',
] as const

export type RegionalPartnerModuleKey = (typeof REGIONAL_PARTNER_MODULE_KEYS)[number]

export type RegionalCity = { province: string; city: string }

export type RegionalPartnerRow = {
  id: string
  company_name: string
  phone: string
  password_hash: string
  cities: unknown
  permissions: unknown
  partner_share_rate: number | string
  platform_share_rate: number | string
  status: 'active' | 'disabled'
  note: string
  created_at: string
  updated_at: string
}

export type RegionalPartnerPublic = {
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

export type RegionalPartnerSession = {
  partnerId: string
  phone: string
  companyName: string
  permissions: RegionalPartnerModuleKey[]
  cities: RegionalCity[]
  partnerShareRate: number
  platformShareRate: number
  loginAt: string
  exp: number
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(0, 11)
}

function uid(): string {
  return `rp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function hashRegionalPasswordSync(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

function sessionSecret(env: NodeJS.ProcessEnv): string {
  const s = (env.MEOO_REGIONAL_PARTNER_SESSION_SECRET ?? '').trim()
  if (s) return s
  const ops = (env.MEOO_OPS_STAFF_SESSION_SECRET ?? '').trim()
  if (ops) return `${ops}:regional`
  const sr = (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE ?? '').trim()
  if (sr) return `${sr.slice(0, 40)}:regional`
  return 'meoo-regional-partner-dev-only-secret'
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url')
}

export function signRegionalPartnerToken(
  payload: RegionalPartnerSession,
  env: NodeJS.ProcessEnv,
): string {
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', sessionSecret(env)).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyRegionalPartnerToken(
  token: string,
  env: NodeJS.ProcessEnv,
): RegionalPartnerSession | null {
  const t = token.trim()
  const dot = t.lastIndexOf('.')
  if (dot <= 0) return null
  const body = t.slice(0, dot)
  const sig = t.slice(dot + 1)
  const expected = createHmac('sha256', sessionSecret(env)).update(body).digest('base64url')
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as RegionalPartnerSession
    if (!payload.partnerId || !payload.phone || typeof payload.exp !== 'number') return null
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export { bearerTokenFromAuthHeader }

export function parseCities(raw: unknown): RegionalCity[] {
  if (!Array.isArray(raw)) return []
  const out: RegionalCity[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const province = String(o.province ?? '').trim()
    const city = String(o.city ?? '').trim()
    if (!city) continue
    const key = `${province}|${city}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ province, city })
  }
  return out
}

export function parsePartnerPermissions(raw: unknown): RegionalPartnerModuleKey[] {
  const keys = new Set<string>(REGIONAL_PARTNER_MODULE_KEYS)
  if (!Array.isArray(raw)) return ['dashboard', 'merchants', 'settlement']
  const out: RegionalPartnerModuleKey[] = []
  for (const p of raw) {
    const k = String(p)
    if (keys.has(k) && !out.includes(k as RegionalPartnerModuleKey)) {
      out.push(k as RegionalPartnerModuleKey)
    }
  }
  return out.length ? out : ['dashboard']
}

function rateNum(v: number | string | undefined, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.round(n * 10000) / 10000
}

function rowToPublic(row: RegionalPartnerRow): RegionalPartnerPublic {
  return {
    id: row.id,
    companyName: row.company_name?.trim() || row.phone,
    phone: row.phone,
    cities: parseCities(row.cities),
    permissions: parsePartnerPermissions(row.permissions),
    partnerShareRate: rateNum(row.partner_share_rate, 0.8),
    platformShareRate: rateNum(row.platform_share_rate, 0.2),
    status: row.status === 'disabled' ? 'disabled' : 'active',
    note: row.note ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function fetchByPhone(
  admin: SupabaseClient,
  phone: string,
): Promise<RegionalPartnerRow | null> {
  const { data, error } = await admin
    .from('regional_partners')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()
  if (error || !data) return null
  return data as RegionalPartnerRow
}

async function fetchById(admin: SupabaseClient, id: string): Promise<RegionalPartnerRow | null> {
  const { data, error } = await admin.from('regional_partners').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return data as RegionalPartnerRow
}

/** 同城仅允许一个 active 区域服务商 */
async function assertCitiesExclusive(
  admin: SupabaseClient,
  cities: RegionalCity[],
  excludeId?: string,
): Promise<{ ok: true } | { ok: false; error: string; conflictCity?: string }> {
  if (!cities.length) return { ok: false, error: 'cities_required' }
  const { data, error } = await admin
    .from('regional_partners')
    .select('id,company_name,cities,status')
    .eq('status', 'active')
  if (error) return { ok: false, error: error.message }
  const want = new Set(cities.map((c) => `${c.province}|${c.city}`))
  for (const row of (data ?? []) as Array<{
    id: string
    company_name: string
    cities: unknown
    status: string
  }>) {
    if (excludeId && row.id === excludeId) continue
    for (const c of parseCities(row.cities)) {
      const key = `${c.province}|${c.city}`
      if (want.has(key)) {
        return {
          ok: false,
          error: 'city_exclusive_conflict',
          conflictCity: c.city || key,
        }
      }
    }
  }
  return { ok: true }
}

export async function listRegionalPartners(
  admin: SupabaseClient,
): Promise<RegionalPartnerPublic[]> {
  const { data, error } = await admin
    .from('regional_partners')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as RegionalPartnerRow[]).map(rowToPublic)
}

export async function createRegionalPartner(
  admin: SupabaseClient,
  input: {
    phone: string
    companyName: string
    password: string
    cities: RegionalCity[]
    permissions?: RegionalPartnerModuleKey[]
    partnerShareRate?: number
    platformShareRate?: number
    note?: string
  },
): Promise<{ ok: true; partner: RegionalPartnerPublic } | { ok: false; error: string; conflictCity?: string }> {
  const phone = normalizePhone(input.phone)
  if (phone.length !== 11) return { ok: false, error: 'invalid_phone' }
  if (input.password.length < 6) return { ok: false, error: 'password_too_short' }
  const cities = parseCities(input.cities)
  const exclusive = await assertCitiesExclusive(admin, cities)
  if (!exclusive.ok) return exclusive
  if (await fetchByPhone(admin, phone)) return { ok: false, error: 'phone_exists' }

  let partnerShare = rateNum(input.partnerShareRate, 0.8)
  let platformShare = rateNum(input.platformShareRate, 0.2)
  if (input.partnerShareRate != null && input.platformShareRate == null) {
    platformShare = Math.round((1 - partnerShare) * 10000) / 10000
  } else if (input.platformShareRate != null && input.partnerShareRate == null) {
    partnerShare = Math.round((1 - platformShare) * 10000) / 10000
  }
  if (Math.abs(partnerShare + platformShare - 1) > 0.0001) {
    return { ok: false, error: 'share_rate_invalid' }
  }

  const now = new Date().toISOString()
  const row: RegionalPartnerRow = {
    id: uid(),
    company_name: input.companyName.trim() || phone,
    phone,
    password_hash: hashRegionalPasswordSync(input.password),
    cities,
    permissions: parsePartnerPermissions(input.permissions),
    partner_share_rate: partnerShare,
    platform_share_rate: platformShare,
    status: 'active',
    note: (input.note ?? '').trim(),
    created_at: now,
    updated_at: now,
  }
  const { error } = await admin.from('regional_partners').insert(row)
  if (error) return { ok: false, error: error.message }
  return { ok: true, partner: rowToPublic(row) }
}

export async function updateRegionalPartner(
  admin: SupabaseClient,
  id: string,
  patch: {
    companyName?: string
    password?: string
    cities?: RegionalCity[]
    permissions?: RegionalPartnerModuleKey[]
    partnerShareRate?: number
    platformShareRate?: number
    status?: 'active' | 'disabled'
    note?: string
  },
): Promise<{ ok: true; partner: RegionalPartnerPublic } | { ok: false; error: string; conflictCity?: string }> {
  const existing = await fetchById(admin, id)
  if (!existing) return { ok: false, error: 'not_found' }

  const nextCities = patch.cities != null ? parseCities(patch.cities) : parseCities(existing.cities)
  const nextStatus = patch.status ?? (existing.status === 'disabled' ? 'disabled' : 'active')
  if (nextStatus === 'active') {
    const exclusive = await assertCitiesExclusive(admin, nextCities, id)
    if (!exclusive.ok) return exclusive
  }

  let partnerShare = rateNum(
    patch.partnerShareRate != null ? patch.partnerShareRate : existing.partner_share_rate,
    0.8,
  )
  let platformShare = rateNum(
    patch.platformShareRate != null ? patch.platformShareRate : existing.platform_share_rate,
    0.2,
  )
  if (patch.partnerShareRate != null && patch.platformShareRate == null) {
    platformShare = Math.round((1 - partnerShare) * 10000) / 10000
  } else if (patch.platformShareRate != null && patch.partnerShareRate == null) {
    partnerShare = Math.round((1 - platformShare) * 10000) / 10000
  }
  if (Math.abs(partnerShare + platformShare - 1) > 0.0001) {
    return { ok: false, error: 'share_rate_invalid' }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    partner_share_rate: partnerShare,
    platform_share_rate: platformShare,
    status: nextStatus,
  }
  if (patch.companyName != null) updates.company_name = patch.companyName.trim() || existing.phone
  if (patch.cities != null) updates.cities = nextCities
  if (patch.permissions != null) updates.permissions = parsePartnerPermissions(patch.permissions)
  if (patch.note != null) updates.note = patch.note.trim()
  if (patch.password?.trim()) {
    if (patch.password.length < 6) return { ok: false, error: 'password_too_short' }
    updates.password_hash = hashRegionalPasswordSync(patch.password)
  }

  const { error } = await admin.from('regional_partners').update(updates).eq('id', id)
  if (error) return { ok: false, error: error.message }
  const refreshed = await fetchById(admin, id)
  if (!refreshed) return { ok: false, error: 'not_found' }
  return { ok: true, partner: rowToPublic(refreshed) }
}

export async function verifyRegionalPartnerLogin(
  admin: SupabaseClient,
  phoneRaw: string,
  password: string,
  env: NodeJS.ProcessEnv,
): Promise<
  | { ok: true; partner: RegionalPartnerPublic; sessionToken: string; session: RegionalPartnerSession }
  | { ok: false; error: string }
> {
  const phone = normalizePhone(phoneRaw)
  if (phone.length !== 11) return { ok: false, error: 'invalid_phone' }
  const row = await fetchByPhone(admin, phone)
  if (!row) return { ok: false, error: 'not_found' }
  if (row.status === 'disabled') return { ok: false, error: 'disabled' }
  if (hashRegionalPasswordSync(password) !== row.password_hash) {
    return { ok: false, error: 'bad_password' }
  }
  const partner = rowToPublic(row)
  const loginAt = new Date().toISOString()
  const session: RegionalPartnerSession = {
    partnerId: partner.id,
    phone: partner.phone,
    companyName: partner.companyName,
    permissions: partner.permissions,
    cities: partner.cities,
    partnerShareRate: partner.partnerShareRate,
    platformShareRate: partner.platformShareRate,
    loginAt,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  }
  return {
    ok: true,
    partner,
    sessionToken: signRegionalPartnerToken(session, env),
    session,
  }
}

export async function requireRegionalPartnerSession(
  admin: SupabaseClient,
  token: string,
  env: NodeJS.ProcessEnv,
): Promise<
  | { ok: true; session: RegionalPartnerSession; partner: RegionalPartnerPublic }
  | { ok: false; status: number; error: string }
> {
  const session = verifyRegionalPartnerToken(token, env)
  if (!session) return { ok: false, status: 401, error: 'invalid_session' }
  const row = await fetchById(admin, session.partnerId)
  if (!row) return { ok: false, status: 401, error: 'not_found' }
  if (row.status === 'disabled') return { ok: false, status: 403, error: 'disabled' }
  return { ok: true, session, partner: rowToPublic(row) }
}

/** 运营台：主账号，或具备 regional_partners 模块权限的子账号 */
export async function requireOpsRegionalPartnersAccess(
  admin: SupabaseClient,
  token: string,
  env: NodeJS.ProcessEnv,
): Promise<
  | { ok: true; session: OpsSessionPayload }
  | { ok: false; status: number; error: string }
> {
  const superR = await requireSuperAdminSession(admin, token, env)
  if (superR.ok) return { ok: true, session: superR.session }
  const session = verifyOpsSessionToken(token, env)
  if (!session) return { ok: false, status: 401, error: 'invalid_session' }
  if (session.role === 'super_admin') return { ok: true, session }
  const has =
    session.permissions.includes('regional_partners') ||
    !!session.permissionGrants?.regional_partners?.view ||
    !!session.permissionGrants?.regional_partners?.edit
  if (!has) return { ok: false, status: 403, error: 'permission_denied' }
  return { ok: true, session }
}

export async function assignMerchantToPartner(
  admin: SupabaseClient,
  input: { tenantId: string; partnerId: string; attributionCity?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const partner = await fetchById(admin, input.partnerId)
  if (!partner) return { ok: false, error: 'partner_not_found' }
  if (partner.status === 'disabled') return { ok: false, error: 'partner_disabled' }
  const city =
    (input.attributionCity ?? '').trim() ||
    parseCities(partner.cities)[0]?.city ||
    ''
  const { error } = await admin
    .from('tenants')
    .update({
      regional_partner_id: input.partnerId,
      attribution_city: city || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function unassignMerchantFromPartner(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin
    .from('tenants')
    .update({
      regional_partner_id: null,
      attribution_city: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

type TenantLite = {
  id: string
  name: string
  account_status: string
  service_expire_at: string | null
  regional_partner_id: string | null
  attribution_city: string | null
  created_at: string
  official_days?: number
  trial_days?: number
}

type OrderLite = {
  id: string
  tenant_id: string
  order_kind: string
  amount_cents: number
  status: string
  confirmed_at: string | null
  created_at: string
}

export async function loadPartnerMerchants(
  admin: SupabaseClient,
  partnerId: string,
): Promise<TenantLite[]> {
  const { data, error } = await admin
    .from('tenants')
    .select(
      'id,name,account_status,service_expire_at,regional_partner_id,attribution_city,created_at,official_days,trial_days',
    )
    .eq('regional_partner_id', partnerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as TenantLite[]
}

export async function loadPartnerConfirmedOrders(
  admin: SupabaseClient,
  tenantIds: string[],
): Promise<OrderLite[]> {
  if (!tenantIds.length) return []
  const { data, error } = await admin
    .from('merchant_payment_orders')
    .select('id,tenant_id,order_kind,amount_cents,status,confirmed_at,created_at')
    .in('tenant_id', tenantIds)
    .eq('status', 'confirmed')
    .eq('order_kind', 'subscription')
    .order('confirmed_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as OrderLite[]
}

export function buildDashboard(
  partner: RegionalPartnerPublic,
  merchants: TenantLite[],
  orders: OrderLite[],
) {
  const grossCents = orders.reduce((s, o) => s + Number(o.amount_cents || 0), 0)
  const partnerCents = Math.round(grossCents * partner.partnerShareRate)
  const platformCents = Math.round(grossCents * partner.platformShareRate)
  const now = Date.now()
  const activeMerchants = merchants.filter((m) => {
    if (m.account_status === 'disabled' || m.account_status === 'frozen') return false
    if (!m.service_expire_at) return true
    return new Date(m.service_expire_at).getTime() >= now
  }).length
  return {
    cities: partner.cities,
    merchantCount: merchants.length,
    activeMerchantCount: activeMerchants,
    confirmedOrderCount: orders.length,
    grossCents,
    partnerShareCents: partnerCents,
    platformShareCents: platformCents,
    partnerShareRate: partner.partnerShareRate,
    platformShareRate: partner.platformShareRate,
  }
}

export function buildSettlementLines(
  partner: RegionalPartnerPublic,
  merchants: TenantLite[],
  orders: OrderLite[],
) {
  const nameById = new Map(merchants.map((m) => [m.id, m.name]))
  return orders.map((o) => {
    const amount = Number(o.amount_cents || 0)
    return {
      orderId: o.id,
      tenantId: o.tenant_id,
      merchantName: nameById.get(o.tenant_id) ?? o.tenant_id.slice(0, 8),
      orderKind: o.order_kind,
      amountCents: amount,
      partnerShareCents: Math.round(amount * partner.partnerShareRate),
      platformShareCents: Math.round(amount * partner.platformShareRate),
      confirmedAt: o.confirmed_at,
      createdAt: o.created_at,
    }
  })
}
