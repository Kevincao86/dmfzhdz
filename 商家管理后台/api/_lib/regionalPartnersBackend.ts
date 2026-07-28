import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { ensureErpMonthlyGiftPointsGranted } from '../../../web版/merchant-erp/src/lib/erpPointsCore.js'
import { normalizeMembershipPlan } from '../../../web版/merchant-erp/src/lib/membershipPlan.js'
import {
  bearerTokenFromAuthHeader,
  requireSuperAdminSession,
  verifyOpsSessionToken,
  type OpsSessionPayload,
} from './opsStaffAccountsBackend.js'
import { opsTenantPatchAdmin } from './opsTenantsMutationsBackend.js'

export type MembershipPlanKey = 'free' | 'member' | 'member_plus'

function parseMembershipPlan(raw: unknown): MembershipPlanKey | undefined {
  if (raw === 'free' || raw === 'member' || raw === 'member_plus') return raw
  return undefined
}

export const REGIONAL_PARTNER_MODULE_KEYS = [
  'dashboard',
  'merchants',
  'settlement',
  'pricing',
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
  if (!Array.isArray(raw)) return ['dashboard', 'merchants', 'settlement', 'pricing']
  const out: RegionalPartnerModuleKey[] = []
  for (const p of raw) {
    const k = String(p)
    if (keys.has(k) && !out.includes(k as RegionalPartnerModuleKey)) {
      out.push(k as RegionalPartnerModuleKey)
    }
  }
  if (!out.length) return ['dashboard']
  // 存量代理：已有名下商家权限则默认开放区域定价
  if (out.includes('merchants') && !out.includes('pricing')) out.push('pricing')
  return out
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

export function normalizeCityLabel(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/(特别行政区|自治区|省|市|地区|自治州|盟)$/u, '')
    .trim()
}

export function cityLabelVariants(city: string): string[] {
  const c = String(city || '').trim()
  if (!c) return []
  const n = normalizeCityLabel(c)
  const set = new Set<string>([c])
  if (n) set.add(n)
  if (n && !n.endsWith('市')) set.add(`${n}市`)
  return [...set]
}

export function partnerCityNameSet(cities: RegionalCity[]): Set<string> {
  const set = new Set<string>()
  for (const c of cities) {
    for (const v of cityLabelVariants(c.city)) set.add(v)
    set.add(normalizeCityLabel(c.city))
  }
  return set
}

export function tenantCityInPartnerScope(
  tenant: { attribution_city?: string | null; register_city?: string | null },
  partnerCities: RegionalCity[],
): boolean {
  const scope = partnerCityNameSet(partnerCities)
  const candidates = [tenant.register_city, tenant.attribution_city]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
  for (const c of candidates) {
    if (scope.has(c) || scope.has(normalizeCityLabel(c))) return true
  }
  return false
}

/**
 * 从营业执照住所/经营场所地址中识别城市，并校验是否命中代理城市范围。
 * 规则：地址文本须包含代理城市名（或去「市」后的简称），取最长命中。
 */
export function resolveLicenseCityInScope(
  licenseAddress: string,
  partnerCities: RegionalCity[],
): { ok: true; city: RegionalCity; matchedToken: string } | { ok: false; error: string } {
  const addr = String(licenseAddress || '').trim()
  if (addr.length < 4) return { ok: false, error: 'license_address_required' }
  if (!partnerCities.length) return { ok: false, error: 'partner_cities_empty' }

  let best: RegionalCity | null = null
  let matchedToken = ''
  let bestLen = 0
  for (const c of partnerCities) {
    for (const v of cityLabelVariants(c.city)) {
      if (v.length < 2) continue
      if (addr.includes(v) && v.length > bestLen) {
        best = c
        matchedToken = v
        bestLen = v.length
      }
    }
  }
  if (!best) {
    return { ok: false, error: 'license_city_not_in_scope' }
  }
  return { ok: true, city: best, matchedToken }
}

function tenantEmailDomain(): string {
  return (
    process.env.VITE_SUPABASE_TENANT_EMAIL_DOMAIN ??
    process.env.TENANT_EMAIL_DOMAIN ??
    'users.meoo.test'
  )
    .trim()
    .replace(/^@/, '') || 'users.meoo.test'
}

function loginNameToEmail(loginName: string): string {
  const slug = loginName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'user'}@${tenantEmailDomain()}`
}

export async function changeRegionalPartnerPassword(
  admin: SupabaseClient,
  partnerId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 6) return { ok: false, error: 'password_too_short' }
  const row = await fetchById(admin, partnerId)
  if (!row) return { ok: false, error: 'not_found' }
  if (row.status === 'disabled') return { ok: false, error: 'disabled' }
  if (hashRegionalPasswordSync(oldPassword) !== row.password_hash) {
    return { ok: false, error: 'bad_old_password' }
  }
  const { error } = await admin
    .from('regional_partners')
    .update({
      password_hash: hashRegionalPasswordSync(newPassword),
      updated_at: new Date().toISOString(),
    })
    .eq('id', partnerId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * 与运营台 provision-tenant 同源开户（auth + tenants + tenant_members），
 * 额外写入区域服务商归属 / 执照地址 / 可选套餐档位。
 */
export async function createPartnerScopedTenant(
  admin: SupabaseClient,
  partner: RegionalPartnerPublic,
  input: {
    loginName: string
    password: string
    merchantName: string
    edition?: 'merchant' | 'partner'
    licenseAddress: string
    /** 与运营台一致：默认 0（无试用） */
    trialDays?: number
    /** 与运营台一致：正式版权益天数 */
    officialDays?: number
    /** 套餐方案：free / member / member_plus */
    membershipPlan?: string
  },
): Promise<
  | { ok: true; tenantId: string; userId: string; city: RegionalCity; matchedToken: string }
  | { ok: false; error: string; detail?: string }
> {
  const loginName = input.loginName.trim()
  const merchantName = input.merchantName.trim()
  const password = input.password
  const licenseAddress = input.licenseAddress.trim()
  // 与运营台 provision-tenant 校验对齐
  if (loginName.length < 2) return { ok: false, error: 'invalid_login_name' }
  if (password.length < 6) return { ok: false, error: 'password_too_short' }
  if (merchantName.length < 1) return { ok: false, error: 'invalid_merchant_name' }

  const hit = resolveLicenseCityInScope(licenseAddress, partner.cities)
  if (!hit.ok) return { ok: false, error: hit.error }

  const edition = input.edition === 'partner' ? 'partner' : 'merchant'
  const trialDays = Math.max(0, Math.min(3650, Number(input.trialDays) || 0))
  const officialDays = Math.max(0, Math.min(36500, Number(input.officialDays) || 0))
  const membershipPlan = parseMembershipPlan(input.membershipPlan) ?? 'free'
  const email = loginNameToEmail(loginName)

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      login_name: loginName,
      merchant_name: merchantName,
      provisioned_by_regional_partner: partner.id,
    },
  })
  if (createErr || !created.user?.id) {
    const msg = String(createErr?.message || 'auth_create_failed').toLowerCase()
    if (msg.includes('already') || msg.includes('exists')) {
      return { ok: false, error: 'login_exists' }
    }
    return { ok: false, error: 'auth_create_failed', detail: createErr?.message }
  }
  const userId = created.user.id

  // 与 provision-tenant 写入字段同源，再叠加区域服务商字段
  const tenantInsert: Record<string, unknown> = {
    name: merchantName,
    trial_days: trialDays,
    official_days: officialDays,
    account_status: 'normal',
    membership_plan: membershipPlan,
    edition,
    regional_partner_id: partner.id,
    attribution_city: hit.city.city,
    register_city: hit.city.city,
    register_province: hit.city.province,
    business_license_address: licenseAddress,
  }

  let tenantId = ''
  {
    let { data: tenantRow, error: tenantErr } = await admin
      .from('tenants')
      .insert(tenantInsert)
      .select('id')
      .maybeSingle()

    if (
      tenantErr &&
      /business_license_address|schema cache|does not exist/i.test(tenantErr.message)
    ) {
      const fallback = { ...tenantInsert }
      delete fallback.business_license_address
      const retry = await admin.from('tenants').insert(fallback).select('id').maybeSingle()
      tenantRow = retry.data
      tenantErr = retry.error
    }

    if (tenantErr || !tenantRow?.id) {
      await admin.auth.admin.deleteUser(userId)
      return { ok: false, error: 'tenant_insert_failed', detail: tenantErr?.message }
    }
    tenantId = tenantRow.id as string
  }

  const { error: memErr } = await admin.from('tenant_members').insert({
    tenant_id: tenantId,
    user_id: userId,
    role: 'owner',
  })
  if (memErr) {
    await admin.from('tenants').delete().eq('id', tenantId)
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: 'member_insert_failed', detail: memErr.message }
  }

  // 与运营台改档同源：非免费档立即补发当月套餐积分
  if (membershipPlan !== 'free') {
    try {
      await ensureErpMonthlyGiftPointsGranted(admin as never, tenantId, {
        plan: normalizeMembershipPlan(membershipPlan),
      })
    } catch {
      /* 积分补发失败不阻断开户 */
    }
  }

  return {
    ok: true,
    tenantId,
    userId,
    city: hit.city,
    matchedToken: hit.matchedToken,
  }
}

export async function assignMerchantToPartner(
  admin: SupabaseClient,
  input: { tenantId: string; partnerId: string; attributionCity?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const partner = await fetchById(admin, input.partnerId)
  if (!partner) return { ok: false, error: 'partner_not_found' }
  if (partner.status === 'disabled') return { ok: false, error: 'partner_disabled' }
  const cities = parseCities(partner.cities)
  const cityRaw =
    (input.attributionCity ?? '').trim() || cities[0]?.city || ''
  if (!cityRaw) return { ok: false, error: 'cities_required' }
  if (!tenantCityInPartnerScope({ attribution_city: cityRaw, register_city: cityRaw }, cities)) {
    return { ok: false, error: 'city_out_of_scope' }
  }
  const province =
    cities.find((c) => cityLabelVariants(c.city).includes(cityRaw) || normalizeCityLabel(c.city) === normalizeCityLabel(cityRaw))
      ?.province || ''
  const { error } = await admin
    .from('tenants')
    .update({
      regional_partner_id: input.partnerId,
      attribution_city: cityRaw,
      register_city: cityRaw,
      register_province: province || null,
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

export type TenantAccountRow = {
  id: string
  name: string
  edition?: string | null
  account_status: string
  service_expire_at: string | null
  regional_partner_id: string | null
  attribution_city: string | null
  register_province?: string | null
  register_city?: string | null
  business_license_address?: string | null
  membership_plan?: string | null
  ops_gift_days?: number | null
  official_days?: number | null
  trial_days?: number | null
  subscription_days?: number | null
  created_at: string
  updated_at?: string
}

/** @deprecated alias — 结算/看板仍用此名 */
export type TenantLite = TenantAccountRow

type OrderLite = {
  id: string
  tenant_id: string
  order_kind: string
  amount_cents: number
  status: string
  confirmed_at: string | null
  created_at: string
}

const ERP_EDITIONS = ['merchant', 'partner', 'partner_agent'] as const

export function editionLabel(edition: string | null | undefined): string {
  if (edition === 'partner') return 'FWS服务商'
  if (edition === 'partner_agent') return 'FWS子代'
  return '商家ERP'
}

const TENANT_ACCOUNT_SELECT =
  'id,name,edition,account_status,service_expire_at,regional_partner_id,attribution_city,register_province,register_city,business_license_address,membership_plan,ops_gift_days,official_days,trial_days,subscription_days,created_at,updated_at'

function resolveTenantCity(row: TenantAccountRow): string {
  return String(row.register_city || row.attribution_city || '').trim()
}

/** 区域服务商城市范围内的商家 ERP + FWS 账号 */
export async function loadPartnerCityAccounts(
  admin: SupabaseClient,
  partner: RegionalPartnerPublic,
): Promise<TenantAccountRow[]> {
  const cities = partner.cities
  const variants = [...new Set(cities.flatMap((c) => cityLabelVariants(c.city)))]
  const orParts = [`regional_partner_id.eq.${partner.id}`]
  if (variants.length) {
    const listed = variants.map((v) => `"${v.replace(/"/g, '')}"`).join(',')
    orParts.push(`attribution_city.in.(${listed})`)
    orParts.push(`register_city.in.(${listed})`)
  }

  const { data, error } = await admin
    .from('tenants')
    .select(TENANT_ACCOUNT_SELECT)
    .in('edition', [...ERP_EDITIONS])
    .or(orParts.join(','))
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) {
    // register_city 列尚未迁移时回退
    if (/register_city|register_province|schema cache|does not exist/i.test(error.message)) {
      const { data: legacy, error: e2 } = await admin
        .from('tenants')
        .select(
          'id,name,edition,account_status,service_expire_at,regional_partner_id,attribution_city,membership_plan,ops_gift_days,official_days,trial_days,subscription_days,created_at,updated_at',
        )
        .or(
          [`regional_partner_id.eq.${partner.id}`]
            .concat(
              variants.length
                ? [`attribution_city.in.(${variants.map((v) => `"${v.replace(/"/g, '')}"`).join(',')})`]
                : [],
            )
            .join(','),
        )
        .order('created_at', { ascending: false })
        .limit(2000)
      if (e2) throw new Error(e2.message)
      return ((legacy ?? []) as TenantAccountRow[]).filter(
        (row) =>
          ERP_EDITIONS.includes((row.edition || 'merchant') as (typeof ERP_EDITIONS)[number]) &&
          (row.regional_partner_id === partner.id ||
            tenantCityInPartnerScope(row, cities)),
      )
    }
    throw new Error(error.message)
  }

  return ((data ?? []) as TenantAccountRow[]).filter(
    (row) =>
      row.regional_partner_id === partner.id || tenantCityInPartnerScope(row, cities),
  )
}

export async function loadPartnerMerchants(
  admin: SupabaseClient,
  partnerId: string,
): Promise<TenantLite[]> {
  const row = await fetchById(admin, partnerId)
  if (!row) return []
  return loadPartnerCityAccounts(admin, rowToPublic(row))
}

export async function searchTenantsForPartnerClaim(
  admin: SupabaseClient,
  _partner: RegionalPartnerPublic,
  keyword: string,
): Promise<TenantAccountRow[]> {
  const q = keyword.trim()
  if (q.length < 2) return []
  const { data, error } = await admin
    .from('tenants')
    .select(TENANT_ACCOUNT_SELECT)
    .in('edition', [...ERP_EDITIONS])
    .ilike('name', `%${q.replace(/[%_]/g, '')}%`)
    .order('created_at', { ascending: false })
    .limit(40)
  if (error) throw new Error(error.message)
  return (data ?? []) as TenantAccountRow[]
}

export async function assertTenantInPartnerScope(
  admin: SupabaseClient,
  partner: RegionalPartnerPublic,
  tenantId: string,
): Promise<{ ok: true; row: TenantAccountRow } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('tenants')
    .select(TENANT_ACCOUNT_SELECT)
    .eq('id', tenantId)
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'tenant_not_found' }
  const row = data as TenantAccountRow
  const edition = row.edition || 'merchant'
  if (!ERP_EDITIONS.includes(edition as (typeof ERP_EDITIONS)[number])) {
    return { ok: false, error: 'edition_not_allowed' }
  }
  if (
    row.regional_partner_id === partner.id ||
    tenantCityInPartnerScope(row, partner.cities)
  ) {
    return { ok: true, row }
  }
  return { ok: false, error: 'out_of_scope' }
}

export async function patchPartnerScopedTenant(
  admin: SupabaseClient,
  partner: RegionalPartnerPublic,
  input: {
    tenantId: string
    merchantName?: string
    accountStatus?: 'normal' | 'disabled' | 'frozen'
    opsGiftDays?: number
    membershipPlan?: string
    registerCity?: string
    registerProvince?: string
    licenseAddress?: string
  },
): Promise<{ ok: true; row: TenantAccountRow } | { ok: false; error: string }> {
  const gate = await assertTenantInPartnerScope(admin, partner, input.tenantId)
  // 认领：尚未入范围时，须带执照地址或 registerCity，且城市在代理范围内
  let row = gate.ok ? gate.row : null
  if (!gate.ok) {
    if (gate.error !== 'out_of_scope' && gate.error !== 'tenant_not_found') {
      return { ok: false, error: gate.error }
    }
    if (!input.registerCity?.trim() && !input.licenseAddress?.trim()) {
      return { ok: false, error: gate.error }
    }
    const { data, error } = await admin
      .from('tenants')
      .select(TENANT_ACCOUNT_SELECT)
      .eq('id', input.tenantId)
      .maybeSingle()
    if (error || !data) return { ok: false, error: 'tenant_not_found' }
    row = data as TenantAccountRow
  }
  if (!row) return { ok: false, error: 'tenant_not_found' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (input.licenseAddress?.trim()) {
    const hit = resolveLicenseCityInScope(input.licenseAddress, partner.cities)
    if (!hit.ok) return { ok: false, error: hit.error }
    patch.business_license_address = input.licenseAddress.trim()
    patch.register_city = hit.city.city
    patch.attribution_city = hit.city.city
    patch.register_province = hit.city.province
    patch.regional_partner_id = partner.id
  } else if (input.registerCity?.trim()) {
    const city = input.registerCity.trim()
    if (!tenantCityInPartnerScope({ attribution_city: city, register_city: city }, partner.cities)) {
      return { ok: false, error: 'city_out_of_scope' }
    }
    const province =
      input.registerProvince?.trim() ||
      partner.cities.find(
        (c) =>
          cityLabelVariants(c.city).includes(city) ||
          normalizeCityLabel(c.city) === normalizeCityLabel(city),
      )?.province ||
      ''
    patch.register_city = city
    patch.attribution_city = city
    if (province) patch.register_province = province
    patch.regional_partner_id = partner.id
  } else if (gate.ok) {
    patch.regional_partner_id = partner.id
  }

  if (Object.keys(patch).length > 1) {
    const { error: updErr } = await admin.from('tenants').update(patch).eq('id', input.tenantId)
    if (updErr) return { ok: false, error: updErr.message }
  }

  // 名称 / 状态 / 赠送天数 / 套餐：与运营台 opsTenantPatchAdmin 同源
  const membershipPlan = parseMembershipPlan(input.membershipPlan)
  const opsBody: Record<string, unknown> = { id: input.tenantId }
  if (input.merchantName?.trim()) opsBody.merchantName = input.merchantName.trim()
  if (
    input.accountStatus === 'normal' ||
    input.accountStatus === 'disabled' ||
    input.accountStatus === 'frozen'
  ) {
    opsBody.accountStatus = input.accountStatus
  }
  if (typeof input.opsGiftDays === 'number' && Number.isFinite(input.opsGiftDays)) {
    opsBody.opsGiftDays = input.opsGiftDays
  }
  if (membershipPlan) opsBody.membershipPlan = membershipPlan

  if (Object.keys(opsBody).length > 1) {
    const ops = await opsTenantPatchAdmin(admin, opsBody)
    if (!ops.ok) {
      return {
        ok: false,
        error: String((ops.body as { error?: string }).error ?? 'ops_patch_failed'),
      }
    }
  }

  const refreshed = await assertTenantInPartnerScope(admin, partner, input.tenantId)
  if (!refreshed.ok) {
    const { data } = await admin
      .from('tenants')
      .select(TENANT_ACCOUNT_SELECT)
      .eq('id', input.tenantId)
      .maybeSingle()
    if (!data) return { ok: false, error: 'tenant_not_found' }
    return { ok: true, row: data as TenantAccountRow }
  }
  return { ok: true, row: refreshed.row }
}

export function mapTenantAccountPublic(row: TenantAccountRow) {
  const now = Date.now()
  const expireMs = row.service_expire_at ? new Date(row.service_expire_at).getTime() : null
  const active =
    row.account_status !== 'disabled' &&
    row.account_status !== 'frozen' &&
    (expireMs == null || expireMs >= now)
  const city = resolveTenantCity(row)
  const plan = (row.membership_plan || 'free') as MembershipPlanKey
  const planLabels: Record<MembershipPlanKey, string> = {
    free: '免费版',
    member: '会员版',
    member_plus: '会员 Plus',
  }
  const subscriptionDays = Number(
    row.subscription_days != null ? row.subscription_days : row.official_days ?? 0,
  ) || 0
  return {
    id: row.id,
    name: row.name,
    edition: row.edition || 'merchant',
    editionLabel: editionLabel(row.edition),
    accountStatus: row.account_status,
    membershipPlan: plan,
    membershipPlanLabel: planLabels[plan] ?? plan,
    trialDays: Number(row.trial_days ?? 0) || 0,
    officialDays: Number(row.official_days ?? 0) || 0,
    subscriptionDays,
    opsGiftDays: Number(row.ops_gift_days ?? 0) || 0,
    serviceExpireAt: row.service_expire_at,
    registerProvince: row.register_province || null,
    registerCity: row.register_city || null,
    attributionCity: row.attribution_city || null,
    businessLicenseAddress: row.business_license_address || null,
    city: city || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    openStatus: active ? '开通中' : '已到期/停用',
  }
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
