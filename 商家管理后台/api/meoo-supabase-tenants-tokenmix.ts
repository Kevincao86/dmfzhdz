/**
 * POST /api/meoo-supabase-tenants-tokenmix
 * action: bind | usage
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { opsTenantTokenmixAdmin } from './opsTenantsMutationsBackend.js'

export const config = { maxDuration: 60 }

function jsonSend(res: VercelResponse, status: number, payload: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(payload))
}

function bodyRaw(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object')
    return JSON.stringify(req.body)
  return '{}'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
      hint: '配置 SUPABASE_SERVICE_ROLE_KEY',
    })
    return
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const out = await opsTenantTokenmixAdmin(admin, body, process.env as Record<string, string>)
  if (out.ok === false) {
    jsonSend(res, out.status, out.body)
    return
  }
  jsonSend(res, 200, out.body)
}
