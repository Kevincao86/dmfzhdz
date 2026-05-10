/**
 * Vercel：GET /api/ops-supabase/payment-orders（运营台订单列表）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../../lib/createOpsServiceRoleClient'
import { listOpsPaymentOrders } from '../../../src/ops/paymentOrdersAdminBackend'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
}
