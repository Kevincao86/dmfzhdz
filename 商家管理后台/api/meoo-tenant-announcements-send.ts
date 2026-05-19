/**
 * POST /api/meoo-tenant-announcements-send
 * Body: { category, title, body, targetAll?, tenantIds? }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import {
  parseAnnouncementCategory,
  sendTenantAnnouncement,
} from './tenantAnnouncementsCore'

export const config = { maxDuration: 60 }

function json(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!supabaseUrl || !serviceKey) {
    json(res, 503, { ok: false, error: 'supabase_admin_not_configured' })
    return
  }

  const body = (typeof req.body === 'object' && req.body ? req.body : {}) as Record<string, unknown>
  const category = parseAnnouncementCategory(body.category)
  if (!category) {
    json(res, 400, { ok: false, error: 'invalid_category' })
    return
  }

  const targetAll = body.targetAll === true || body.target_all === true
  const tenantIds = Array.isArray(body.tenantIds)
    ? body.tenantIds
    : Array.isArray(body.tenant_ids)
      ? body.tenant_ids
      : []

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result = await sendTenantAnnouncement(admin, {
    category,
    title: String(body.title ?? ''),
    body: String(body.body ?? ''),
    targetAll,
    tenantIds: tenantIds.map(String),
    createdBy: typeof body.createdBy === 'string' ? body.createdBy : null,
  })

  if (!result.ok) {
    const status = result.error === 'migration_required' ? 503 : 400
    json(res, status, result)
    return
  }

  json(res, 200, {
    ok: true,
    announcementId: result.announcementId,
    recipientCount: result.recipientCount,
  })
}
