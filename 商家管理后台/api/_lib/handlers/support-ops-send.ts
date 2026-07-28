/**
 * 运营台通过 HTTP 发送客服回复，写入 ECS Postgres support_relay_messages（service_role）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { insertSupportOpsReply } from '../supportOpsSendCore.js'

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

  const result = await insertSupportOpsReply({
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : '',
    text: typeof body.text === 'string' ? body.text : '',
    id: typeof body.id === 'string' ? body.id : '',
  })

  if (!result.ok) {
    sendJson(res, result.status, {
      ok: false,
      error: result.error,
      detail: result.detail,
      missing: result.missing,
      hint: result.hint,
      supabaseHost: result.supabaseHost,
    })
    return
  }

  sendJson(res, 200, { ok: true, supabaseHost: result.supabaseHost, verified: result.verified })
}
