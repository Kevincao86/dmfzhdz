/**
 * Vercel：POST /api/ops-supabase/payment-orders/delete
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../../createOpsServiceRoleClient'
import { sendOpsJson } from '../../safeOpsJson'
import { deleteOpsPaymentOrderAdmin } from '../../../src/ops/paymentOrdersAdminBackend'

export const config = { maxDuration: 60 }

function bodyRaw(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
  return '{}'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    if (req.method !== 'POST') {
      res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyRaw(req) || '{}') as Record<string, unknown>
    } catch {
      res.status(400).send(JSON.stringify({ ok: false, error: 'invalid_json' }))
      return
    }

    const client = createOpsServiceRoleClient()
    if (!client.ok) {
      res.status(client.status).send(JSON.stringify(client.body))
      return
    }

    const dr = await deleteOpsPaymentOrderAdmin(client.admin, body)
    if (!dr.ok) {
      res.status(dr.status).send(JSON.stringify(dr.body))
      return
    }
    res.status(200).send(JSON.stringify({ ok: true }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'payment_order_delete_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
