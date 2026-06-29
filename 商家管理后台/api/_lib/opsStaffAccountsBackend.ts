import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  buildPermissionsV2Payload,
  defaultDataScope,
  normalizeDataScope,
  parsePermissionsPayload,
  type OpsDataScope,
  type OpsModuleGrant,
} from './opsPermissionsV2Backend.js'

export const OPS_MASTER_PHONE = '18768501283'

/** 历史误写入的错误主账号手机号（5446bf8 曾写错为 81283），登录时自动清理 */
export const OPS_MASTER_PHONE_LEGACY_WRONG = '18768581283'
export const OPS_MASTER_DEFAULT_PASSWORD = 'kaiyedaji888'

export const OPS_MASTER_PASSWORD_HASH =
  '973e095059955e0c458333ac4bb54113de5c54011390d3ad2869ed1c9af493e0'

/** 须与 src/ops/opsStaffAuth.ts OPS_PERMISSION_MODULES 的 key 保持一致 */
export const OPS_PERMISSION_MODULE_KEYS = [
  'customers',
  'announcements',
  'payment_orders',
  'mp_membership_finance',
  'recruitment_orders',
  'mp_recruitment_orders',
  'talent_library',
  'shoot_team_library',
  'edit_team_library',
  'pr_library',
  'ai_models',
  'support',
  'support_mp',
  'help_manual',
  'team_intro',
] as const

export type OpsPermissionKey = (typeof OPS_PERMISSION_MODULE_KEYS)[number]
export type OpsStaffRole = 'super_admin' | 'sub_admin'

export type OpsStaffAccountRow = {
  id: string
  phone: string
  display_name: string
  role: OpsStaffRole
  password_hash: string
  permissions: unknown
  status: 'active' | 'disabled'
  created_at: string
  updated_at: string
}

export type OpsStaffAccountPublic = {
  id: string
  phone: string
  displayName: string
  role: OpsStaffRole
  permissions: OpsPermissionKey[]
  permissionGrants: Partial<Record<OpsPermissionKey, OpsModuleGrant>>
  dataScope: OpsDataScope
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
}

export type OpsSessionPayload = {
  accountId: string
  phone: string
  displayName: string
  role: OpsStaffRole
  permissions: OpsPermissionKey[]
  permissionGrants: Partial<Record<OpsPermissionKey, OpsModuleGrant>>
  dataScope: OpsDataScope
  loginAt: string
  exp: number
}

function allPermissionKeys(): OpsPermissionKey[] {
  return [...OPS_PERMISSION_MODULE_KEYS]
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(0, 11)
}

function parsePermissions(raw: unknown, role: OpsStaffRole): OpsPermissionKey[] {
  const parsed = parsePermissionsPayload(raw, role, allPermissionKeys())
  return parsed.legacyKeys.filter((p): p is OpsPermissionKey =>
    OPS_PERMISSION_MODULE_KEYS.includes(p as OpsPermissionKey),
  )
}

function parsePermissionsFull(raw: unknown, role: OpsStaffRole) {
  const all = allPermissionKeys()
  const parsed = parsePermissionsPayload(raw, role, all)
  return {
    legacyKeys: parsed.legacyKeys.filter((p): p is OpsPermissionKey =>
      OPS_PERMISSION_MODULE_KEYS.includes(p as OpsPermissionKey),
    ),
    grants: parsed.grants as Partial<Record<OpsPermissionKey, OpsModuleGrant>>,
    dataScope: parsed.dataScope,
  }
}

function rowToPublic(row: OpsStaffAccountRow): OpsStaffAccountPublic {
  const role: OpsStaffRole = row.role === 'super_admin' ? 'super_admin' : 'sub_admin'
  const full = parsePermissionsFull(row.permissions, role)
  return {
    id: row.id,
    phone: row.phone,
    displayName: row.display_name?.trim() || row.phone,
    role,
    permissions: full.legacyKeys,
    permissionGrants: full.grants,
    dataScope: full.dataScope,
    status: row.status === 'disabled' ? 'disabled' : 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function hashOpsPasswordSync(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

function sessionSecret(env: NodeJS.ProcessEnv): string {
  const s = (env.MEOO_OPS_STAFF_SESSION_SECRET ?? '').trim()
  if (s) return s
  const sr = (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE ?? '').trim()
  if (sr) return sr.slice(0, 48)
  return 'meoo-ops-staff-dev-only-secret'
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url')
}

export function signOpsSessionToken(payload: OpsSessionPayload, env: NodeJS.ProcessEnv): string {
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', sessionSecret(env)).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyOpsSessionToken(
  token: string,
  env: NodeJS.ProcessEnv,
): OpsSessionPayload | null {
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
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as OpsSessionPayload
    if (!payload.accountId || !payload.phone || typeof payload.exp !== 'number') return null
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function bearerTokenFromAuthHeader(header: string | undefined): string {
  const h = (header ?? '').trim()
  if (!h.toLowerCase().startsWith('bearer ')) return ''
  return h.slice(7).trim()
}

function uid(): string {
  return `ops_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

async function fetchRowByPhone(admin: SupabaseClient, phone: string): Promise<OpsStaffAccountRow | null> {
  const { data, error } = await admin
    .from('ops_staff_accounts')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()
  if (error || !data) return null
  return data as OpsStaffAccountRow
}

async function fetchRowById(admin: SupabaseClient, id: string): Promise<OpsStaffAccountRow | null> {
  const { data, error } = await admin.from('ops_staff_accounts').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return data as OpsStaffAccountRow
}

export async function ensureOpsMasterAccountInDb(admin: SupabaseClient): Promise<void> {
  const legacyWrong = await fetchRowByPhone(admin, OPS_MASTER_PHONE_LEGACY_WRONG)
  if (legacyWrong?.role === 'super_admin') {
    const { error: delErr } = await admin.from('ops_staff_accounts').delete().eq('id', legacyWrong.id)
    if (delErr) throw new Error(delErr.message)
  }

  const existing = await fetchRowByPhone(admin, OPS_MASTER_PHONE)
  const now = new Date().toISOString()
  const perms = allPermissionKeys()

  if (existing) {
    const needsUpdate =
      existing.role !== 'super_admin' ||
      existing.password_hash !== OPS_MASTER_PASSWORD_HASH ||
      existing.status !== 'active' ||
      existing.display_name !== '超级管理员'
    if (needsUpdate) {
      const { error: updErr } = await admin
        .from('ops_staff_accounts')
        .update({
          role: 'super_admin',
          password_hash: OPS_MASTER_PASSWORD_HASH,
          permissions: perms,
          status: 'active',
          display_name: '超级管理员',
          updated_at: now,
        })
        .eq('id', existing.id)
      if (updErr) throw new Error(updErr.message)
    }
    return
  }

  const { error: insErr } = await admin.from('ops_staff_accounts').insert({
    id: 'ops_master',
    phone: OPS_MASTER_PHONE,
    display_name: '超级管理员',
    role: 'super_admin',
    password_hash: OPS_MASTER_PASSWORD_HASH,
    permissions: perms,
    status: 'active',
    created_at: now,
    updated_at: now,
  })
  if (insErr) throw new Error(insErr.message)
}

export async function listOpsStaffAccountsPublic(admin: SupabaseClient): Promise<OpsStaffAccountPublic[]> {
  await ensureOpsMasterAccountInDb(admin)
  const { data, error } = await admin
    .from('ops_staff_accounts')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as OpsStaffAccountRow[]).map(rowToPublic)
}

export async function verifyOpsStaffLogin(
  admin: SupabaseClient,
  phoneRaw: string,
  password: string,
  env: NodeJS.ProcessEnv,
): Promise<
  | { ok: true; account: OpsStaffAccountPublic; sessionToken: string; session: OpsSessionPayload }
  | { ok: false; error: string }
> {
  await ensureOpsMasterAccountInDb(admin)
  const phone = normalizePhone(phoneRaw)
  if (phone.length !== 11) return { ok: false, error: 'invalid_phone' }
  /** 历史误写主号 81283 → 统一按 01283 查库 */
  const lookupPhone =
    phone === OPS_MASTER_PHONE_LEGACY_WRONG ? OPS_MASTER_PHONE : phone
  const row = await fetchRowByPhone(admin, lookupPhone)
  if (!row) return { ok: false, error: 'not_found' }
  if (row.status === 'disabled') return { ok: false, error: 'disabled' }
  const hash = hashOpsPasswordSync(password)
  if (hash !== row.password_hash) return { ok: false, error: 'bad_password' }
  const account = rowToPublic(row)
  const loginAt = new Date().toISOString()
  const session: OpsSessionPayload = {
    accountId: account.id,
    phone: account.phone,
    displayName: account.displayName,
    role: account.role,
    permissions: account.permissions,
    permissionGrants: account.permissionGrants,
    dataScope: account.dataScope,
    loginAt,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  }
  return { ok: true, account, sessionToken: signOpsSessionToken(session, env), session }
}

export async function createOpsSubAccountInDb(
  admin: SupabaseClient,
  input: {
    phone: string
    displayName: string
    password: string
    permissions?: OpsPermissionKey[]
    permissionGrants?: Partial<Record<OpsPermissionKey, OpsModuleGrant>>
    dataScope?: OpsDataScope
  },
): Promise<{ ok: true; account: OpsStaffAccountPublic } | { ok: false; error: string }> {
  await ensureOpsMasterAccountInDb(admin)
  const phone = normalizePhone(input.phone)
  if (phone.length !== 11) return { ok: false, error: 'invalid_phone' }
  if (phone === OPS_MASTER_PHONE) return { ok: false, error: 'reserved_phone' }
  if (input.password.length < 6) return { ok: false, error: 'password_too_short' }

  let grants = input.permissionGrants
  if (!grants && input.permissions) {
    grants = {}
    for (const p of input.permissions) grants[p] = { view: true, edit: true }
  }
  grants = grants ?? {}
  const scope = normalizeDataScope(input.dataScope ?? defaultDataScope())
  const payload = buildPermissionsV2Payload(grants, scope)
  const legacy = parsePermissionsPayload(payload, 'sub_admin', allPermissionKeys()).legacyKeys.filter(
    (p): p is OpsPermissionKey => OPS_PERMISSION_MODULE_KEYS.includes(p as OpsPermissionKey),
  )
  if (legacy.length === 0) return { ok: false, error: 'permissions_required' }

  const existing = await fetchRowByPhone(admin, phone)
  if (existing) return { ok: false, error: 'phone_exists' }

  const now = new Date().toISOString()
  const row: OpsStaffAccountRow = {
    id: uid(),
    phone,
    display_name: input.displayName.trim() || phone,
    role: 'sub_admin',
    password_hash: hashOpsPasswordSync(input.password),
    permissions: payload,
    status: 'active',
    created_at: now,
    updated_at: now,
  }
  const { error } = await admin.from('ops_staff_accounts').insert(row)
  if (error) return { ok: false, error: error.message }
  return { ok: true, account: rowToPublic(row) }
}

export async function updateOpsSubAccountInDb(
  admin: SupabaseClient,
  id: string,
  patch: {
    displayName?: string
    permissions?: OpsPermissionKey[]
    permissionGrants?: Partial<Record<OpsPermissionKey, OpsModuleGrant>>
    dataScope?: OpsDataScope
    status?: 'active' | 'disabled'
    password?: string
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await fetchRowById(admin, id)
  if (!row) return { ok: false, error: 'not_found' }
  if (row.role === 'super_admin') return { ok: false, error: 'cannot_edit_master' }

  const current = parsePermissionsFull(row.permissions, 'sub_admin')
  let permissionsPayload: unknown = row.permissions
  if (patch.permissionGrants || patch.permissions || patch.dataScope != null) {
    let grants = patch.permissionGrants ?? current.grants
    if (patch.permissions && !patch.permissionGrants) {
      grants = {}
      for (const p of patch.permissions) grants[p] = { view: true, edit: true }
    }
    const scope = patch.dataScope != null ? normalizeDataScope(patch.dataScope) : current.dataScope
    const payload = buildPermissionsV2Payload(grants, scope)
    const legacy = parsePermissionsPayload(payload, 'sub_admin', allPermissionKeys()).legacyKeys
    if (legacy.length === 0) return { ok: false, error: 'permissions_required' }
    permissionsPayload = payload
  }
  let passwordHash = row.password_hash
  if (patch.password != null && patch.password.length > 0) {
    if (patch.password.length < 6) return { ok: false, error: 'password_too_short' }
    passwordHash = hashOpsPasswordSync(patch.password)
  }

  const { error } = await admin
    .from('ops_staff_accounts')
    .update({
      display_name: patch.displayName?.trim() ? patch.displayName.trim() : row.display_name,
      permissions: permissionsPayload,
      status: patch.status ?? row.status,
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteOpsSubAccountInDb(
  admin: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await fetchRowById(admin, id)
  if (!row) return { ok: false, error: 'not_found' }
  if (row.role === 'super_admin') return { ok: false, error: 'cannot_delete_master' }
  const { error } = await admin.from('ops_staff_accounts').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function migrateOpsStaffAccountsInDb(
  admin: SupabaseClient,
  accounts: Array<{
    id: string
    phone: string
    displayName: string
    role: OpsStaffRole
    passwordHash: string
    permissions: OpsPermissionKey[]
    status: 'active' | 'disabled'
    createdAt: string
    updatedAt: string
  }>,
): Promise<{ ok: true; imported: number } | { ok: false; error: string }> {
  await ensureOpsMasterAccountInDb(admin)
  let imported = 0
  for (const a of accounts) {
    if (a.role === 'super_admin') continue
    const phone = normalizePhone(a.phone)
    if (phone.length !== 11 || phone === OPS_MASTER_PHONE) continue
    if (!a.passwordHash) continue
    const existing = await fetchRowByPhone(admin, phone)
    if (existing) continue
    const perms = [...new Set(a.permissions)].filter((p) => OPS_PERMISSION_MODULE_KEYS.includes(p))
    if (perms.length === 0) continue
    const now = new Date().toISOString()
    const { error } = await admin.from('ops_staff_accounts').insert({
      id: a.id || uid(),
      phone,
      display_name: a.displayName.trim() || phone,
      role: 'sub_admin',
      password_hash: a.passwordHash,
      permissions: perms,
      status: a.status === 'disabled' ? 'disabled' : 'active',
      created_at: a.createdAt || now,
      updated_at: a.updatedAt || now,
    })
    if (!error) imported += 1
  }
  return { ok: true, imported }
}

export async function requireSuperAdminSession(
  admin: SupabaseClient,
  token: string,
  env: NodeJS.ProcessEnv,
): Promise<
  | { ok: true; session: OpsSessionPayload; row: OpsStaffAccountRow }
  | { ok: false; status: number; error: string }
> {
  const payload = verifyOpsSessionToken(token, env)
  if (!payload) return { ok: false, status: 401, error: 'invalid_session' }
  const row = await fetchRowById(admin, payload.accountId)
  if (!row || row.status === 'disabled') return { ok: false, status: 401, error: 'invalid_session' }
  if (row.role !== 'super_admin') return { ok: false, status: 403, error: 'super_admin_required' }
  return { ok: true, session: payload, row }
}
