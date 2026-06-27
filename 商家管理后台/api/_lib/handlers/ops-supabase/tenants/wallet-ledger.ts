/**
 * Vercel：GET /api/ops-supabase/tenants/wallet-ledger?tenant_id=
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../../../createOpsServiceRoleClient'
import { opsTenantWalletLedgerAdmin } from '../../../opsTenantsMutationsBackend'
import { sendOpsJson } from '../../../safeOpsJson'

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
    try {
      const q = new URL(urlStr, 'http://local').searchParams.get('tenant_id')
      tenantId = q?.trim() ?? ''
    } catch {
      tenantId = ''
    }

    const r = await opsTenantWalletLedgerAdmin(client.admin, tenantId)
    if (!r.ok) {
      res.status(r.status).send(JSON.stringify(r.body))
      return
    }
    res.status(200).send(JSON.stringify({ ok: true, rows: r.rows }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'wallet_ledger_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
