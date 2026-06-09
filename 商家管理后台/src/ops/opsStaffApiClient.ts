import { fetchOpsErpApi } from '../lib/opsErpApiBase'
import type { OpsPermissionKey, OpsSession, OpsStaffAccount, OpsStaffRole } from './opsStaffAuth'

const OPS_STAFF_LOGIN_PATH = '/api/meoo-ops-staff-login'
const OPS_STAFF_LIST_PATH = '/api/meoo-ops-staff-list'
const OPS_STAFF_MUTATE_PATH = '/api/meoo-ops-staff-mutate'

/** 子账号读写须走 ECS erp-api（Vercel Function 无法访问轻量 Postgres） */
async function fetchOpsStaffApi(path: string, init?: RequestInit): Promise<Response> {
  return fetchOpsErpApi(path, init, { ecsOnly: true })
}

export type OpsStaffApiAccount = Omit<OpsStaffAccount, 'passwordHash'>

function authHeaders(sessionToken?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = sessionToken?.trim()
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

function mapApiAccount(a: OpsStaffApiAccount): OpsStaffAccount {
  return {
    ...a,
    passwordHash: '',
  }
}

export async function apiOpsStaffLogin(
  phone: string,
  password: string,
): Promise<
  | { ok: true; session: OpsSession; sessionToken: string; account: OpsStaffAccount }
  | { ok: false; useLocalFallback: boolean; error?: string }
> {
  try {
    const res = await fetchOpsStaffApi(OPS_STAFF_LOGIN_PATH, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ phone, password }),
    })
    const data = (await res.json()) as Record<string, unknown>
    if (
      res.status === 503 ||
      data.error === 'supabase_admin_not_configured' ||
      data.error === 'ops_staff_table_missing'
    ) {
      return {
        ok: false,
        useLocalFallback: true,
        error: String(data.error ?? 'cloud_unavailable'),
      }
    }
    // 云端尚无该账号（子账号未迁移等）时，回退本机 localStorage 校验
    if (res.status === 401 && data.code === 'not_found') {
      return { ok: false, useLocalFallback: true, error: 'not_found' }
    }
    if (!res.ok || data.ok === false) {
      const code = String(data.code ?? 'bad_credentials').trim() || 'bad_credentials'
      return { ok: false, useLocalFallback: false, error: code }
    }
    const sessionRaw = data.session as Record<string, unknown> | undefined
    const sessionToken = String(data.sessionToken ?? '').trim()
    if (!sessionRaw || !sessionToken) {
      return { ok: false, useLocalFallback: false, error: 'invalid_response' }
    }
    const role: OpsStaffRole = sessionRaw.role === 'super_admin' ? 'super_admin' : 'sub_admin'
    const permissions = Array.isArray(sessionRaw.permissions)
      ? (sessionRaw.permissions.filter(Boolean) as OpsPermissionKey[])
      : []
    const accountRaw = data.account as OpsStaffApiAccount | undefined
    const session: OpsSession = {
      accountId: String(sessionRaw.accountId ?? accountRaw?.id ?? ''),
      phone: String(sessionRaw.phone ?? accountRaw?.phone ?? ''),
      displayName: String(sessionRaw.displayName ?? accountRaw?.displayName ?? sessionRaw.phone ?? ''),
      role,
      permissions,
      loginAt: String(sessionRaw.loginAt ?? new Date().toISOString()),
      sessionToken,
    }
    const account = accountRaw
      ? mapApiAccount(accountRaw)
      : {
          id: session.accountId,
          phone: session.phone,
          displayName: session.displayName,
          role: session.role,
          passwordHash: '',
          permissions: session.permissions,
          status: 'active' as const,
          createdAt: '',
          updatedAt: '',
        }
    return { ok: true, session, sessionToken, account }
  } catch {
    return { ok: false, useLocalFallback: true }
  }
}

export async function apiOpsStaffList(
  sessionToken: string,
): Promise<
  | { ok: true; accounts: OpsStaffAccount[] }
  | { ok: false; useLocalFallback: boolean; unauthorized?: boolean }
> {
  try {
    const res = await fetchOpsStaffApi(OPS_STAFF_LIST_PATH, {
      method: 'GET',
      headers: authHeaders(sessionToken),
    })
    const data = (await res.json()) as Record<string, unknown>
    if (res.status === 503 || data.error === 'supabase_admin_not_configured') {
      return { ok: false, useLocalFallback: true }
    }
    if (res.status === 401) return { ok: false, useLocalFallback: false, unauthorized: true }
    if (!res.ok || data.ok === false) return { ok: false, useLocalFallback: false }
    const rows = Array.isArray(data.accounts) ? data.accounts : []
    return { ok: true, accounts: rows.map((x) => mapApiAccount(x as OpsStaffApiAccount)) }
  } catch {
    return { ok: false, useLocalFallback: true }
  }
}

export async function apiOpsStaffMutate(
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; account?: OpsStaffAccount; imported?: number } | { ok: false; error: string }> {
  try {
    const res = await fetchOpsStaffApi(OPS_STAFF_MUTATE_PATH, {
      method: 'POST',
      headers: authHeaders(sessionToken),
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as Record<string, unknown>
    if (!res.ok || data.ok === false) {
      return { ok: false, error: String(data.code ?? data.message ?? 'request_failed') }
    }
    const account = data.account ? mapApiAccount(data.account as OpsStaffApiAccount) : undefined
    const imported = typeof data.imported === 'number' ? data.imported : undefined
    return { ok: true, account, imported }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function apiMigrateLocalStaff(
  sessionToken: string,
  accounts: OpsStaffAccount[],
): Promise<{ ok: true; imported: number } | { ok: false; error: string }> {
  const r = await apiOpsStaffMutate(sessionToken, {
    action: 'migrate_local',
    accounts: accounts.map((a) => ({
      id: a.id,
      phone: a.phone,
      displayName: a.displayName,
      role: a.role,
      passwordHash: a.passwordHash,
      permissions: a.permissions,
      status: a.status,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  })
  if (!r.ok) return r
  return { ok: true, imported: r.imported ?? 0 }
}
