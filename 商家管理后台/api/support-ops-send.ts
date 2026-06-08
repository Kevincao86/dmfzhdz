/**
 * 运营台通过 HTTP 发送客服回复，写入 Supabase（service_role，Node 运行时）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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

  const supabaseUrl = (
    process.env.MEOO_SUPABASE_ADMIN_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ''
  )
    .trim()
    .replace(/\/$/, '')
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRole) {
    sendJson(res, 503, { ok: false, error: 'supabase_service_not_configured' })
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

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/support_relay_messages`, {
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
      sendJson(res, 502, { ok: false, error: 'supabase_insert_failed', detail: t.slice(0, 500) })
      return
    }

    sendJson(res, 200, { ok: true })
  } catch (e) {
    sendJson(res, 502, {
      ok: false,
      error: 'support_send_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
