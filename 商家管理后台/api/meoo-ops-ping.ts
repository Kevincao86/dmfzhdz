/**
 * 探活：GET /api/meoo-ops-ping
 * GET /api/meoo-ops-ping?check=support — 额外检测 service_role 能否读 support_relay_messages
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const out: Record<string, unknown> = {
    ok: true,
    route: 'meoo-ops-ping',
    ts: new Date().toISOString(),
  }

  const checkSupport = String(req.query.check ?? '').trim().toLowerCase() === 'support'
  if (!checkSupport) {
    sendJson(res, 200, out)
    return
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)?.trim().replace(/\/$/, '')
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  let host = ''
  try {
    host = supabaseUrl ? new URL(supabaseUrl).host : ''
  } catch {
    host = '(invalid url)'
  }

  out.supportRelay = {
    supabaseHost: host || null,
    hasServiceRole: Boolean(serviceRole),
    hasServerPollToken: Boolean(process.env.MEOO_SUPPORT_OPS_HTTP_TOKEN?.trim()),
    hasClientPollToken: Boolean(process.env.VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN?.trim()),
  }

  if (!supabaseUrl || !serviceRole) {
    out.ok = false
    sendJson(res, 503, {
      ...out,
      error: 'supabase_service_not_configured',
      hint: '配置 SUPABASE_URL=https://mofangdianai.com 与 SUPABASE_SERVICE_ROLE_KEY',
    })
    return
  }

  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    Accept: 'application/json',
  }

  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/support_relay_messages?select=session_id,from_role,text,ts&order=ts.desc&limit=3`,
      { headers },
    )
    const text = await r.text()
    if (!r.ok) {
      out.ok = false
      ;(out.supportRelay as Record<string, unknown>).tableSelect = {
        status: r.status,
        ok: false,
        preview: text.slice(0, 300),
      }
      sendJson(res, 502, out)
      return
    }
    ;(out.supportRelay as Record<string, unknown>).tableSelect = { status: r.status, ok: true }
    ;(out.supportRelay as Record<string, unknown>).latestMessages = JSON.parse(text)
    sendJson(res, 200, out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    out.ok = false
    ;(out.supportRelay as Record<string, unknown>).tableSelect = {
      ok: false,
      error: msg,
    }
    sendJson(res, 502, {
      ...out,
      hint:
        /fetch failed/i.test(msg)
          ? 'Vercel 无法访问 ECS。运营台请配置 VITE_MEEO_SUPPORT_OPS_API_BASE=https://mofangdianai.com/erp-api 并 Redeploy；客户列表/客服改由浏览器直连 ECS。'
          : undefined,
    })
  }
}
