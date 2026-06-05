import type { VercelRequest } from '@vercel/node'
import {
  OPS_MASTER_PASSWORD_HASH,
  OPS_MASTER_PHONE,
  bearerTokenFromAuthHeader,
  hashOpsPasswordSync,
  verifyOpsSessionToken,
} from './opsStaffAccountsBackend.js'

export type TenantDeleteAuthInput = {
  authorizationHeader?: string
  masterPhone?: string
  masterPassword?: string
}

export type TenantPurgeResult =
  | { ok: true; deletedUserIds: string[]; ownerPhone?: string }
  | { ok: false; error: string; detail?: string }

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(0, 11)
}

function serviceRoleHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
}

function phoneFromAuthUser(u: Record<string, unknown>): string | null {
  const meta = u.user_metadata as { phone?: string } | undefined
  const fromMeta = normalizePhone(meta?.phone ?? '')
  if (fromMeta.length === 11) return fromMeta
  const rawPhone = typeof u.phone === 'string' ? u.phone : ''
  const digits = rawPhone.replace(/\D/g, '')
  if (digits.startsWith('86') && digits.length === 13) return digits.slice(2)
  const plain = normalizePhone(digits)
  return plain.length === 11 ? plain : null
}

export function verifyOpsMasterDeleteAuth(
  input: TenantDeleteAuthInput,
  env: NodeJS.ProcessEnv,
): { ok: true } | { ok: false; status: number; error: string } {
  const token = bearerTokenFromAuthHeader(input.authorizationHeader)
  if (token) {
    const payload = verifyOpsSessionToken(token, env)
    if (payload && normalizePhone(payload.phone) === OPS_MASTER_PHONE) {
      return { ok: true }
    }
  }

  const phone = normalizePhone(input.masterPhone ?? '')
  const password = input.masterPassword ?? ''
  if (phone === OPS_MASTER_PHONE && password.length >= 6) {
    const hash = hashOpsPasswordSync(password)
    if (hash === OPS_MASTER_PASSWORD_HASH) {
      return { ok: true }
    }
  }

  return { ok: false, status: 403, error: 'master_only' }
}

export function readTenantDeleteAuthFromRequest(req: VercelRequest): TenantDeleteAuthInput {
  const body =
    req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? (req.body as Record<string, unknown>)
      : {}
  return {
    authorizationHeader: typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
    masterPhone: typeof body.masterPhone === 'string' ? body.masterPhone : undefined,
    masterPassword: typeof body.masterPassword === 'string' ? body.masterPassword : undefined,
  }
}

async function listMemberUserIds(
  base: string,
  headers: Record<string, string>,
  tenantId: string,
): Promise<string[]> {
  const memUrl = `${base}/rest/v1/tenant_members?tenant_id=eq.${encodeURIComponent(tenantId)}&select=user_id`
  const mr = await fetch(memUrl, { headers })
  const mtext = await mr.text()
  if (!mr.ok) {
    throw new Error(`members_lookup_failed:${mtext.slice(0, 200)}`)
  }
  let rows: { user_id?: string }[] = []
  try {
    rows = JSON.parse(mtext || '[]') as typeof rows
  } catch {
    rows = []
  }
  return [...new Set(rows.map((r) => r.user_id).filter((id): id is string => typeof id === 'string' && !!id))]
}

async function listAuthUserIdsByPhone(
  base: string,
  headers: Record<string, string>,
  phone: string,
): Promise<string[]> {
  const target = normalizePhone(phone)
  if (target.length !== 11) return []

  const ids: string[] = []
  let page = 1
  while (page <= 25) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, { headers })
    const text = await res.text()
    if (!res.ok) break
    let parsed: { users?: Record<string, unknown>[] } = {}
    try {
      parsed = JSON.parse(text) as typeof parsed
    } catch {
      break
    }
    const users = Array.isArray(parsed.users) ? parsed.users : []
    for (const u of users) {
      const uid = typeof u.id === 'string' ? u.id : ''
      if (!uid) continue
      if (phoneFromAuthUser(u) === target) ids.push(uid)
    }
    if (users.length < 200) break
    page += 1
  }
  return [...new Set(ids)]
}

async function deleteAuthUser(base: string, headers: Record<string, string>, userId: string): Promise<void> {
  await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers,
  })
}

export async function purgeSupabaseTenantById(
  supabaseUrl: string,
  serviceRole: string,
  tenantId: string,
  opts?: { ownerPhone?: string },
): Promise<TenantPurgeResult> {
  const base = supabaseUrl.replace(/\/$/, '')
  const headers = serviceRoleHeaders(serviceRole)

  let memberUserIds: string[] = []
  try {
    memberUserIds = await listMemberUserIds(base, headers, tenantId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: 'members_lookup_failed', detail: msg }
  }

  const ownerPhone = normalizePhone(opts?.ownerPhone ?? '')
  let phoneUserIds: string[] = []
  if (ownerPhone.length === 11) {
    try {
      phoneUserIds = await listAuthUserIdsByPhone(base, headers, ownerPhone)
    } catch {
      phoneUserIds = []
    }
  }

  const dr = await fetch(`${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  })
  if (!dr.ok) {
    const detail = await dr.text()
    return { ok: false, error: 'tenant_delete_failed', detail: detail.slice(0, 400) }
  }

  const userIds = [...new Set([...memberUserIds, ...phoneUserIds])]
  const deletedUserIds: string[] = []
  for (const uid of userIds) {
    try {
      await deleteAuthUser(base, headers, uid)
      deletedUserIds.push(uid)
    } catch {
      /* continue */
    }
  }

  return {
    ok: true,
    deletedUserIds,
    ownerPhone: ownerPhone.length === 11 ? ownerPhone : undefined,
  }
}
