/**
 * Vercel：POST /api/meoo-supabase-tenants-patch
 * 使用 fetch 调 PostgREST，避免 @supabase/supabase-js 在 Vercel 上崩溃（与 meoo-supabase-tenants-list 一致）。
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
    Prefer: 'return=minimal',
  }
}

function buildPatchBody(body: Record<string, unknown>): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'invalid_id' }
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (typeof body.merchantName === 'string' && body.merchantName.trim()) {
    patch.name = body.merchantName.trim()
  }
  if (body.accountStatus === 'normal' || body.accountStatus === 'disabled' || body.accountStatus === 'frozen') {
    patch.account_status = body.accountStatus
  }
  if (typeof body.trialDays === 'number' && Number.isFinite(body.trialDays)) {
    patch.trial_days = Math.max(0, Math.min(3650, Math.floor(body.trialDays)))
  }
  if (typeof body.officialDays === 'number' && Number.isFinite(body.officialDays)) {
    patch.official_days = Math.max(0, Math.min(36500, Math.floor(body.officialDays)))
  }

  return { ok: true, patch }
}

async function edgePostPatch(
  supabaseUrl: string,
  anon: string,
  secret: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ops-patch-tenant`
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

    const built = buildPatchBody(body)
    if (!built.ok) {
      jsonSend(res, 400, { ok: false, error: built.error })
      return
    }

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

    const id = String(body.id ?? '').trim()
    const base = supabaseUrl.replace(/\/$/, '')

    if (serviceRole) {
      const url = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(id)}`
      const r = await fetch(url, {
        method: 'PATCH',
        headers: serviceRoleHeaders(serviceRole),
        body: JSON.stringify(built.patch),
      })
      if (!r.ok) {
        const t = await r.text()
        jsonSend(res, 502, { ok: false, error: 'patch_failed', detail: t.slice(0, 400) })
        return
      }
      jsonSend(res, 200, { ok: true })
      return
    }

    if (anon && secret) {
      const er = await edgePostPatch(supabaseUrl, anon, secret, body)
      if (!er.ok || er.data.ok === false) {
        jsonSend(res, er.status >= 400 ? er.status : 502, {
          ok: false,
          error: 'edge_patch_failed',
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
      hint: '配置 SUPABASE_SERVICE_ROLE_KEY，或 ANON + MEOO_PROVISION_SECRET 并部署 ops-patch-tenant',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'tenant_patch_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
