/**
 * GET /api/meoo-tenant-announcements-list
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { listTenantAnnouncementsForOps } from './tenantAnnouncementsCore'

export const config = { maxDuration: 30 }

function json(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    json(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!supabaseUrl || !serviceKey) {
    json(res, 503, { ok: false, error: 'supabase_admin_not_configured' })
    return
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result = await listTenantAnnouncementsForOps(admin)
  if (!result.ok) {
    const status = result.error === 'migration_required' ? 503 : 500
    json(res, status, result)
    return
  }

  json(res, 200, { ok: true, rows: result.rows })
}
