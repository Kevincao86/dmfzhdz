/**
 * Vercel：POST /api/meoo-supabase-tenants-reset-password
 * fetch 调 PostgREST + Auth Admin，避免 @supabase/supabase-js 在 Vercel 上崩溃。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  try {
    if (res.writableEnded || res.headersSent) return
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).send(JSON.stringify(body))
  } catch {
    try {
      if (!res.writableEnded && !res.headersSent) res.end()
    } catch {
      /* noop */
    }
  }
}

function jsonSend(res: VercelResponse, status: number, payload: unknown): void {
  try {
    const raw = JSON.stringify(payload)
    if (!res.writableEnded && !res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.status(status).send(raw)
    }
  } catch {
    sendOpsJson(res, 500, { ok: false, error: 'json_send_failed' })
  }
}

function bodyRaw(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') return JSON.stringify(req.body)
  return '{}'
}

function serviceRoleHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
}

async function edgePostReset(
  supabaseUrl: string,
  anon: string,
  secret: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ops-reset-tenant-auth-password`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anon}`,
      apikey: anon,
      'Content-Type': 'application/json',
      'x-meoo-provision-secret': secret,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
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

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      jsonSend(res, 400, { ok: false, error: 'invalid_id' })
      return
    }
    const rawPw = typeof body.password === 'string' ? body.password : ''
    const password = rawPw.length >= 6 ? rawPw : '123456'

    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
    const serviceRole = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE ??
      ''
    ).trim()
    const anon = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
    const secret = (process.env.MEOO_PROVISION_SECRET ?? '').trim()

    if (!supabaseUrl) {
      jsonSend(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: '配置 VITE_SUPABASE_URL 或 SUPABASE_URL',
      })
      return
    }

    const base = supabaseUrl.replace(/\/$/, '')
    const headers = serviceRoleHeaders(serviceRole)

    if (serviceRole) {
      const memUrl = `${base}/rest/v1/tenant_members?tenant_id=eq.${encodeURIComponent(id)}&role=eq.owner&select=user_id&limit=1`
      const mr = await fetch(memUrl, { headers })
      const mtext = await mr.text()
      if (!mr.ok) {
        jsonSend(res, 502, { ok: false, error: 'members_lookup_failed', detail: mtext.slice(0, 400) })
        return
      }
      let rows: { user_id?: string }[]
      try {
        rows = JSON.parse(mtext || '[]') as typeof rows
      } catch {
        jsonSend(res, 502, { ok: false, error: 'members_lookup_failed', detail: mtext.slice(0, 200) })
        return
      }
      const uid = rows[0]?.user_id
      if (!uid || typeof uid !== 'string') {
        jsonSend(res, 404, { ok: false, error: 'owner_not_found' })
        return
      }

      const ur = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ password }),
      })
      const utext = await ur.text()
      if (!ur.ok) {
        jsonSend(res, 502, {
          ok: false,
          error: 'auth_update_failed',
          detail: utext.slice(0, 400),
        })
        return
      }
      jsonSend(res, 200, { ok: true })
      return
    }

    if (anon && secret) {
      const er = await edgePostReset(supabaseUrl, anon, secret, { id, password })
      if (!er.ok || er.data.ok === false) {
        jsonSend(res, er.status >= 400 ? er.status : 502, {
          ok: false,
          error: 'edge_reset_failed',
          detail: JSON.stringify(er.data).slice(0, 600),
        })
        return
      }
      jsonSend(res, 200, { ok: true })
      return
    }

    jsonSend(res, 503, {
      ok: false,
      error: 'supabase_admin_not_configured',
      hint: '配置 SUPABASE_SERVICE_ROLE_KEY，或 ANON + MEOO_PROVISION_SECRET 并部署 ops-reset-tenant-auth-password',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'tenant_reset_password_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
