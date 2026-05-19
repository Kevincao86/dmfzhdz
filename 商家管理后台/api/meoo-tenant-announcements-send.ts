/**
 * POST /api/meoo-tenant-announcements-send
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendOpsJson } from './safeOpsJson.js'
import {
  parseAnnouncementCategory,
  parseAnnouncementPriority,
  sendTenantAnnouncement,
} from './tenantAnnouncementsCore.js'

export const config = { maxDuration: 60 }

function readBody(req: VercelRequest): Record<string, unknown> {
  if (typeof req.body === 'object' && req.body && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>
  }
  const raw =
    typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : '{}'
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
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

    const body = readBody(req)
    const category = parseAnnouncementCategory(body.category)
    if (!category) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_category' })
      return
    }

    const targetAll = body.targetAll === true || body.target_all === true
    const tenantIds = Array.isArray(body.tenantIds)
      ? body.tenantIds
      : Array.isArray(body.tenant_ids)
        ? body.tenant_ids
        : []

    const result = await sendTenantAnnouncement(supabaseUrl, serviceKey, {
      category,
      priority: parseAnnouncementPriority(body.priority, category),
      title: String(body.title ?? ''),
      body: String(body.body ?? ''),
      targetAll,
      tenantIds: tenantIds.map(String),
      createdBy: typeof body.createdBy === 'string' ? body.createdBy : null,
    })

    if (!result.ok) {
      const status =
        result.error === 'migration_required'
          ? 503
          : result.error === 'supabase_admin_not_configured'
            ? 503
            : 400
      sendOpsJson(res, status, {
        ...result,
        hint:
          result.error === 'migration_required'
            ? '请在 Supabase 执行迁移 20260522100000_tenant_announcements.sql'
            : undefined,
      })
      return
    }

    sendOpsJson(res, 200, {
      ok: true,
      announcementId: result.announcementId,
      recipientCount: result.recipientCount,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'announcement_send_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
