/**
 * 运营台通过 HTTP 发送客服回复，写入 Supabase（service_role）。
 */
export const config = { runtime: 'edge' }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' })
  }

  const expected = process.env.MEOO_SUPPORT_OPS_HTTP_TOKEN?.trim()
  if (!expected) {
    return json(503, {
      ok: false,
      error: 'support_send_not_configured',
      hint: '配置 MEOO_SUPPORT_OPS_HTTP_TOKEN 与 SUPABASE_SERVICE_ROLE_KEY。',
    })
  }

  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')?.trim()
  if (auth !== expected) {
    return json(401, { ok: false, error: 'unauthorized' })
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)?.trim().replace(/\/$/, '')
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRole) {
    return json(503, { ok: false, error: 'supabase_service_not_configured' })
  }

  let body: { sessionId?: string; text?: string; id?: string }
  try {
    body = (await req.json()) as { sessionId?: string; text?: string; id?: string }
  } catch {
    return json(400, { ok: false, error: 'invalid_json' })
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!sessionId || !text || !id) {
    return json(400, { ok: false, error: 'missing_fields' })
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
      return json(502, { ok: false, error: 'supabase_insert_failed', detail: t.slice(0, 500) })
    }

    return json(200, { ok: true })
  } catch (e) {
    return json(502, {
      ok: false,
      error: 'support_send_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
