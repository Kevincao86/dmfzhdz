import type { SupabaseClient } from '@supabase/supabase-js'

export type TenantGateResult = { ok: true } | { ok: false; message: string }

const DEFAULT_GATE_TIMEOUT_MS = 12_000

async function assertTenantAccessAllowedCore(supabase: SupabaseClient): Promise<TenantGateResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { ok: false, message: '未登录' }

  const { data: rows, error } = await supabase
    .from('tenant_members')
    .select('tenants(account_status)')
    .eq('user_id', session.user.id)

  if (error) {
    // RLS/网络/类型不匹配时若一律拒绝，会出现「已登录 → 一直加载 → 闪回登录」；放行并打日志便于排查策略与连接
    console.warn('[ERP] tenant_members 校验查询失败，本次放行:', error.message)
    return { ok: true }
  }

  const statuses: string[] = []
  for (const row of rows ?? []) {
    const t = row.tenants as unknown
    if (t && typeof t === 'object') {
      if (Array.isArray(t)) {
        for (const x of t) {
          if (x && typeof x === 'object' && 'account_status' in x) {
            const s = (x as { account_status: unknown }).account_status
            if (typeof s === 'string') statuses.push(s)
          }
        }
      } else if ('account_status' in t) {
        const s = (t as { account_status: unknown }).account_status
        if (typeof s === 'string') statuses.push(s)
      }
    }
  }

  if (statuses.length === 0) return { ok: true }

  if (statuses.some((s) => s === 'normal')) return { ok: true }

  const anyFrozen = statuses.some((s) => s === 'frozen')
  return {
    ok: false,
    message: anyFrozen ? '商户账号已冻结，无法登录 ERP' : '商户账号已停用，无法登录 ERP',
  }
}

/**
 * 已登录用户：若存在 tenant_members 关联，则至少需有一个关联租户的 account_status 为 normal 才允许使用 ERP。
 * 与运营管控台对 public.tenants 的停用/冻结一致。
 *
 * @param timeoutMs 单次校验超时（默认 12s）。超时则暂时放行并打日志，避免 Supabase 不可达时整页永久卡在加载。
 */
export async function assertTenantAccessAllowed(
  supabase: SupabaseClient,
  opts?: { timeoutMs?: number },
): Promise<TenantGateResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return assertTenantAccessAllowedCore(supabase)
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<TenantGateResult>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(
        '[ERP] 校验租户状态超时（网络或 Supabase 不可达）。本次暂时允许进入；请检查 VITE_SUPABASE_URL 与网络。',
      )
      resolve({ ok: true })
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([assertTenantAccessAllowedCore(supabase), timeoutPromise])
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    return result
  } catch (e) {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    console.error('[ERP] assertTenantAccessAllowed', e)
    return { ok: true }
  }
}
