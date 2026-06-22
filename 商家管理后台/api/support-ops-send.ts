/**
 * 运营台通过 HTTP 发送客服回复，写入 ECS Postgres support_relay_messages（service_role）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  readSupportRelaySupabaseAdminEnv,
  supportRelayAdminFetch,
  supportRelaySupabaseEnvConfigureHint,
} from '../../web版/merchant-erp/vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const expected = process.env.MEOO_SUPPORT_OPS_HTTP_TOKEN?.trim()
  if (!expected) {
    sendJson(res, 503, {
      ok: false,
      error: 'support_send_not_configured',
      hint: '配置 MEOO_SUPPORT_OPS_HTTP_TOKEN 与 SUPABASE_SERVICE_ROLE_KEY。',
    })
    return
  }

  const auth = String(req.headers.authorization ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  if (auth !== expected) {
    sendJson(res, 401, { ok: false, error: 'unauthorized' })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readSupportRelaySupabaseAdminEnv()
  if (missingParts.length > 0) {
    sendJson(res, 503, {
      ok: false,
      error: 'supabase_service_not_configured',
      missing: missingParts,
      hint: supportRelaySupabaseEnvConfigureHint(missingParts),
    })
    return
  }

  let body: { sessionId?: string; text?: string; id?: string }
  try {
    body = (typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(String(req.body ?? '{}'))) as {
      sessionId?: string
      text?: string
      id?: string
    }
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!sessionId || !text || !id) {
    sendJson(res, 400, { ok: false, error: 'missing_fields' })
    return
  }

  const row = {
    session_id: sessionId,
    customer_id: null,
    enterprise_name: null,
    from_role: 'ops',
    text,
    ts: Date.now(),
    client_msg_id: id,
    author_user_id: null,
  }

  let supabaseHost = ''
  try {
    supabaseHost = new URL(supabaseUrl).host
  } catch {
    supabaseHost = supabaseUrl
  }

  try {
    const r = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages`, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    })

    if (!r.ok) {
      const t = await r.text()
      sendJson(res, 502, {
        ok: false,
        error: 'supabase_insert_failed',
        detail: t.slice(0, 500),
        supabaseHost,
      })
      return
    }

    const verifyQ = new URLSearchParams({
      session_id: `eq.${sessionId}`,
      client_msg_id: `eq.${id}`,
      select: 'from_role,text,ts,client_msg_id',
    })
    const verifyRes = await supportRelayAdminFetch(
      `${supabaseUrl}/rest/v1/support_relay_messages?${verifyQ}`,
      {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
      },
    )
    let verified = false
    if (verifyRes.ok) {
      const rows = (await verifyRes.json()) as unknown
      verified = Array.isArray(rows) && rows.length > 0
    }

    sendJson(res, 200, { ok: true, supabaseHost, verified })
  } catch (e) {
    sendJson(res, 502, {
      ok: false,
      error: 'support_send_failed',
      detail: e instanceof Error ? e.message : String(e),
      supabaseHost,
    })
  }
}
