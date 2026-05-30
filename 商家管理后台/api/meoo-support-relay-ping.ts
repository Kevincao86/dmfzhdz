/**
 * GET /api/meoo-support-relay-ping — 诊断运营台 Vercel 能否用 service_role 读取 support_relay_messages。
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

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)?.trim().replace(/\/$/, '')
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const hasPollToken = Boolean(process.env.MEOO_SUPPORT_OPS_HTTP_TOKEN?.trim())
  const hasClientPollToken = Boolean(process.env.VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN?.trim())

  let host = ''
  try {
    host = supabaseUrl ? new URL(supabaseUrl).host : ''
  } catch {
    host = '(invalid url)'
  }

  const out: Record<string, unknown> = {
    ok: false,
    route: 'meoo-support-relay-ping',
    ts: new Date().toISOString(),
    supabaseHost: host || null,
    hasServiceRole: Boolean(serviceRole),
    hasServerPollToken: hasPollToken,
    hasClientPollToken,
    checks: {} as Record<string, unknown>,
  }

  if (!supabaseUrl || !serviceRole) {
    sendJson(res, 503, {
      ...out,
      error: 'supabase_service_not_configured',
      hint: '配置 SUPABASE_URL（或 VITE_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY，指向 ECS 根域 https://mofangdianai.com',
    })
    return
  }

  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    Accept: 'application/json',
  }
  const checks = out.checks as Record<string, unknown>

  try {
    const countRes = await fetch(
      `${supabaseUrl}/rest/v1/support_relay_messages?select=session_id&limit=1`,
      { headers },
    )
    const countText = await countRes.text()
    checks.tableSelect = {
      status: countRes.status,
      ok: countRes.ok,
      preview: countText.slice(0, 300),
    }
  } catch (e) {
    checks.tableSelect = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  try {
    const latestRes = await fetch(
      `${supabaseUrl}/rest/v1/support_relay_messages?select=session_id,from_role,text,ts&order=ts.desc&limit=3`,
      { headers },
    )
    if (latestRes.ok) {
      checks.latestMessages = await latestRes.json()
    } else {
      checks.latestMessages = { status: latestRes.status, preview: (await latestRes.text()).slice(0, 300) }
    }
  } catch (e) {
    checks.latestMessages = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const tableOk = (checks.tableSelect as { ok?: boolean })?.ok === true
  out.ok = tableOk

  sendJson(res, tableOk ? 200 : 502, out)
}
