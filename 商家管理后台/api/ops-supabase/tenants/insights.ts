/**
 * Vercel：GET /api/ops-supabase/tenants/insights?tenant_id=&login_name=&merchant_name=
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../../createOpsServiceRoleClient'
import { opsTenantInsightsAdmin } from '../../opsTenantInsightsBackend'
import { sendOpsJson } from '../../safeOpsJson'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    if (req.method !== 'GET') {
      res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
      return
    }

    const client = createOpsServiceRoleClient()
    if (!client.ok) {
      res.status(client.status).send(JSON.stringify(client.body))
      return
    }

    const urlStr = typeof req.url === 'string' ? req.url : ''
    let tenantId = ''
    let loginName = ''
    let merchantName = ''
    try {
      const u = new URL(urlStr, 'http://local')
      tenantId = u.searchParams.get('tenant_id')?.trim() ?? ''
      loginName = u.searchParams.get('login_name')?.trim() ?? ''
      merchantName = u.searchParams.get('merchant_name')?.trim() ?? ''
    } catch {
      /* ignore */
    }

    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
    const serviceKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE ??
      ''
    ).trim()

    const r = await opsTenantInsightsAdmin(
      client.admin,
      tenantId,
      loginName,
      merchantName,
      {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
      supabaseUrl,
    )

    if (!r.ok) {
      res.status(r.status).send(JSON.stringify(r.body))
      return
    }

    res.status(200).send(JSON.stringify({ ok: true, usage: r.usage, supportSessions: r.supportSessions }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'tenant_insights_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
