/** 同源 /api/ops-supabase/*：由商家管理后台 Vite 服务端用 Service Role 访问 Supabase */

import type { RegistryTenant } from './opsRegistryApi'

function parseJsonBody(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

export type SupabaseTenantRow = {
  tenant_id: string
  merchant_name: string
  login_name: string
  user_email: string
  account_status: string
  trial_days: number
  official_days: number
  wallet_balance_cents?: number
  service_expire_at?: string | null
  created_at: string
  updated_at: string
  owner_user_id?: string | null
}

/** 是否应对同源 `/api/ops-supabase/*` 发请求（线上恒为 true） */
export function supabaseOpsAvailableOnClient(): boolean {
  // 线上列表走同源 API，服务端用 SUPABASE_URL + SERVICE_ROLE；不要求构建时注入 VITE_SUPABASE_URL。
  if (import.meta.env.PROD) return true
  return !!import.meta.env.VITE_SUPABASE_URL?.trim()
}

export async function fetchSupabaseTenantsForOps(): Promise<
  | { ok: true; rows: SupabaseTenantRow[] }
  | { ok: false; error: string; hint?: string; detail?: string }
> {
  if (!supabaseOpsAvailableOnClient()) {
    return { ok: false, error: 'not_configured' }
  }
  /** 线上须直达独立 Serverless 文件（避免 /tenants 依赖 rewrite 或与旧路由混淆） */
  const res = await fetch('/api/ops-supabase/tenants-list')
  const raw = await res.text()
  const j = parseJsonBody(raw) as {
    ok?: boolean
    rows?: SupabaseTenantRow[]
    error?: string
    hint?: string
    detail?: string
  }
  if (!res.ok || !j.ok) {
    const fallbackDetail = raw.trim().slice(0, 400)
    return {
      ok: false,
      error: (typeof j.error === 'string' && j.error) || `http_${res.status}`,
      hint: typeof j.hint === 'string' ? j.hint : undefined,
      detail: (typeof j.detail === 'string' && j.detail) || fallbackDetail || undefined,
    }
  }
  const rows = Array.isArray(j.rows) ? j.rows : []
  return { ok: true, rows }
}

export type OpsWalletLedgerRow = {
  id: string
  tenant_id: string
  delta_cents: number
  balance_after_cents: number
  reason: string
  ref_order_id: string | null
  created_at: string
}

export async function fetchTenantWalletLedgerForOps(
  tenantId: string,
): Promise<{ ok: true; rows: OpsWalletLedgerRow[] } | { ok: false; error: string; hint?: string }> {
  if (!supabaseOpsAvailableOnClient()) {
    return { ok: false, error: 'not_configured' }
  }
  const res = await fetch(
    `/api/ops-supabase/tenants/wallet-ledger?tenant_id=${encodeURIComponent(tenantId)}`,
  )
  const raw = await res.text()
  const j = parseJsonBody(raw) as {
    ok?: boolean
    rows?: OpsWalletLedgerRow[]
    error?: string
    hint?: string
    detail?: string
  }
  if (!res.ok || !j.ok) {
    return {
      ok: false,
      error: (typeof j.error === 'string' && j.error) || `http_${res.status}`,
      hint: typeof j.hint === 'string' ? j.hint : undefined,
    }
  }
  return { ok: true, rows: Array.isArray(j.rows) ? j.rows : [] }
}

export function supabaseRowsToRegistryTenants(rows: SupabaseTenantRow[]): RegistryTenant[] {
  const now = new Date().toISOString()
  return rows
    .map((r) => {
      const tid = typeof r.tenant_id === 'string' ? r.tenant_id.trim() : ''
      const loginRaw = typeof r.login_name === 'string' ? r.login_name.trim() : ''
      const loginName = loginRaw || '—'
      const merchantRaw = typeof r.merchant_name === 'string' ? r.merchant_name.trim() : ''
      const merchantName = merchantRaw || '—'
      const st = typeof r.account_status === 'string' ? r.account_status : ''
      const accountStatus: RegistryTenant['accountStatus'] =
        st === 'disabled' || st === 'frozen' ? st : 'normal'
      const email = typeof r.user_email === 'string' ? r.user_email.trim() : ''
      const created = typeof r.created_at === 'string' && r.created_at.trim() ? r.created_at : now
      const updated = typeof r.updated_at === 'string' && r.updated_at.trim() ? r.updated_at : created
      return {
        id: tid,
        source: 'supabase' as const,
        loginName,
        merchantName,
        industry: '云服务',
        registeredAt: created,
        accountStatus,
        trialDays: Math.max(0, Number(r.trial_days) || 0),
        officialDays: Math.max(0, Number(r.official_days) || 0),
        updatedAt: updated,
        authLoginEmail: email || undefined,
        walletBalanceCents:
          typeof r.wallet_balance_cents === 'number' && Number.isFinite(r.wallet_balance_cents)
            ? Math.max(0, Math.floor(r.wallet_balance_cents))
            : 0,
        serviceExpireAt:
          typeof r.service_expire_at === 'string' && r.service_expire_at.trim()
            ? r.service_expire_at
            : undefined,
      }
    })
    .filter((t) => t.id.length > 0)
}

export async function patchSupabaseTenant(body: {
  id: string
  merchantName?: string
  accountStatus?: 'normal' | 'disabled' | 'frozen'
  trialDays?: number
  officialDays?: number
}): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const res = await fetch('/api/ops-supabase/tenants/patch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  const j = parseJsonBody(raw) as { ok?: boolean; error?: string; detail?: string }
  if (!res.ok || !j.ok) {
    const detail =
      (typeof j.detail === 'string' && j.detail) || (raw.trim() ? raw.trim().slice(0, 400) : undefined)
    return {
      ok: false,
      error: (typeof j.error === 'string' && j.error) || `http_${res.status}`,
      detail,
    }
  }
  return { ok: true }
}

/** 将租户 owner 对应 Supabase Auth 用户密码重置为指定值（默认 123456），需 Service Role 或 Edge + 密钥 */
export async function resetSupabaseTenantAuthPassword(
  tenantId: string,
  password = '123456',
): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const res = await fetch('/api/ops-supabase/tenants/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: tenantId, password }),
  })
  const raw = await res.text()
  const j = parseJsonBody(raw) as { ok?: boolean; error?: string; detail?: string }
  if (!res.ok || !j.ok) {
    const detail =
      (typeof j.detail === 'string' && j.detail) || (raw.trim() ? raw.trim().slice(0, 400) : undefined)
    return {
      ok: false,
      error: (typeof j.error === 'string' && j.error) || `http_${res.status}`,
      detail,
    }
  }
  return { ok: true }
}
