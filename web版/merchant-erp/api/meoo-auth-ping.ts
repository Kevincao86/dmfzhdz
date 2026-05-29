/**
 * GET /api/meoo-auth-ping — 诊断 Vercel 能否访问自建 Supabase（Auth + REST）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'

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

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  const base = supabaseUrl.replace(/\/$/, '')
  let host = ''
  try {
    host = base ? new URL(base).host : ''
  } catch {
    host = '(invalid url)'
  }

  const out: Record<string, unknown> = {
    ok: missingParts.length === 0,
    supabaseHost: host || null,
    missingEnv: missingParts,
    hasServiceRole: !!serviceRole,
    checks: {} as Record<string, unknown>,
  }

  if (!base || !serviceRole) {
    sendJson(res, 503, out)
    return
  }

  const headers: Record<string, string> = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
  }
  const checks = out.checks as Record<string, unknown>

  try {
    const healthRes = await fetch(`${base}/auth/v1/health`)
    checks.authHealth = { status: healthRes.status, ok: healthRes.ok }
  } catch (e) {
    checks.authHealth = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  try {
    const usersRes = await fetch(`${base}/auth/v1/admin/users?page=1&per_page=1`, { headers })
    const usersText = await usersRes.text()
    checks.adminUsers = {
      status: usersRes.status,
      ok: usersRes.ok,
      preview: usersText.slice(0, 200),
    }
  } catch (e) {
    checks.adminUsers = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  try {
    const restRes = await fetch(`${base}/rest/v1/`, { headers })
    checks.restRoot = { status: restRes.status, ok: restRes.ok }
  } catch (e) {
    checks.restRoot = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const allOk =
    (checks.authHealth as { ok?: boolean })?.ok !== false &&
    (checks.adminUsers as { ok?: boolean })?.ok === true

  sendJson(res, allOk ? 200 : 502, { ...out, ok: allOk })
}
