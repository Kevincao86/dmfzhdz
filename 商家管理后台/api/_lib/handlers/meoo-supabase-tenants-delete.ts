/**
 * POST /api/meoo-supabase-tenants-delete — 永久删除租户（仅超级管理员 18768501283）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  purgeSupabaseTenantById,
  readTenantDeleteAuthFromRequest,
  verifyOpsMasterDeleteAuth,
} from '../tenantDeleteCore.js'

export const config = { maxDuration: 120 }

function jsonSend(res: VercelResponse, status: number, payload: unknown): void {
  try {
    if (!res.writableEnded && !res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.status(status).send(JSON.stringify(payload))
    }
  } catch {
    /* noop */
  }
}

function bodyRaw(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
    return JSON.stringify(req.body)
  }
  return '{}'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      jsonSend(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyRaw(req) || '{}') as Record<string, unknown>
    } catch {
      jsonSend(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const auth = verifyOpsMasterDeleteAuth(readTenantDeleteAuthFromRequest(req), process.env)
    if (!auth.ok) {
      jsonSend(res, auth.status, {
        ok: false,
        error: auth.error,
        message: '仅超级管理员（18768501283）可删除客户',
      })
      return
    }

    const { requireOpsDeleteSmsGate } = await import('../opsDeleteSmsGate.js')
    const smsGate = await requireOpsDeleteSmsGate(body)
    if (!smsGate.ok) {
      jsonSend(res, smsGate.status, { ok: false, error: smsGate.error, message: smsGate.message })
      return
    }

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      jsonSend(res, 400, { ok: false, error: 'invalid_id' })
      return
    }

    const ownerPhone = typeof body.ownerPhone === 'string' ? body.ownerPhone : undefined

    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
    const serviceRole = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE ??
      ''
    ).trim()

    if (!supabaseUrl || !serviceRole) {
      jsonSend(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        message: '未配置 SUPABASE_URL / SERVICE_ROLE_KEY，无法删除云端租户',
      })
      return
    }

    const result = await purgeSupabaseTenantById(supabaseUrl, serviceRole, id, { ownerPhone })
    if (!result.ok) {
      jsonSend(res, 502, {
        ok: false,
        error: result.error,
        detail: result.detail,
        message:
          result.error === 'tenant_delete_failed'
            ? '删除租户失败，请检查数据库权限或外键约束'
            : '删除失败，请稍后重试',
      })
      return
    }

    jsonSend(res, 200, {
      ok: true,
      deletedUserIds: result.deletedUserIds,
      ownerPhone: result.ownerPhone ?? null,
      message: '客户及注册手机号已从数据库清除',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    jsonSend(res, 500, { ok: false, error: 'tenant_delete_handler_failed', detail: msg.slice(0, 800) })
  }
}
