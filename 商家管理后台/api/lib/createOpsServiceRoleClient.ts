import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type OpsServiceClientResult =
  | { ok: true; admin: SupabaseClient }
  | { ok: false; status: number; body: Record<string, unknown> }

/** 与 api/ops-supabase/tenants 一致：线上订单管理等同理依赖 Service Role。 */
export function createOpsServiceRoleClient(): OpsServiceClientResult {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const serviceRole = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    ''
  ).trim()

  if (!supabaseUrl) {
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: '配置 VITE_SUPABASE_URL 或 SUPABASE_URL（Production 环境）。',
      },
    }
  }
  if (!serviceRole) {
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: '订单管理需要 SUPABASE_SERVICE_ROLE_KEY（与客户列表接口相同）。',
      },
    }
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { ok: true, admin }
}
