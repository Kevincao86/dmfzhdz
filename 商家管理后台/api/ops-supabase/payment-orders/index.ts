/**
 * Vercel：GET /api/ops-supabase/payment-orders（运营台订单列表）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../../createOpsServiceRoleClient'
import { sendOpsJson } from '../../safeOpsJson'
import { listOpsPaymentOrders } from '../../../src/ops/paymentOrdersAdminBackend'

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

    const lr = await listOpsPaymentOrders(client.admin)
    if (!lr.ok) {
      res.status(lr.status).send(JSON.stringify(lr.body))
      return
    }
    res.status(200).send(JSON.stringify({ ok: true, rows: lr.data.rows }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'payment_orders_list_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
