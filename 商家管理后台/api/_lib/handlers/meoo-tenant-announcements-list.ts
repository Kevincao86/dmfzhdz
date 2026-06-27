/**
 * GET /api/meoo-tenant-announcements-list
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendOpsJson } from '../safeOpsJson.js'
import { listTenantAnnouncementsForOps } from '../tenantAnnouncementsCore.js'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  try {
    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
      .trim()
      .replace(/\/$/, '')
    const serviceKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE ??
      ''
    ).trim()

    if (!supabaseUrl || !serviceKey) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: '请配置 SUPABASE_SERVICE_ROLE_KEY（与客户列表接口相同）。',
      })
      return
    }

    const result = await listTenantAnnouncementsForOps(supabaseUrl, serviceKey)
    if (!result.ok) {
      sendOpsJson(res, result.error === 'migration_required' ? 503 : 500, {
        ...result,
        hint:
          result.error === 'migration_required'
            ? '请在 Supabase 执行迁移 20260522100000_tenant_announcements.sql'
            : undefined,
      })
      return
    }

    sendOpsJson(res, 200, { ok: true, rows: result.rows })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'announcement_list_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
