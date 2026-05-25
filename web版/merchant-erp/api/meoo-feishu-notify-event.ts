/**
 * POST /api/meoo-feishu-notify-event
 * 商户 ERP 侧业务事件 → 飞书群通知（需登录态）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import {
  notifyFeishuPaymentOrderCreated,
  notifyFeishuSupportMerchantMessage,
} from './opsFeishuNotifications.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
  return '{}'
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

  const auth = await requireMerchantRegistryAuth(req)
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message })
    return
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody(req)) as Record<string, unknown>
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }

  const scene = String(body.scene ?? '').trim()

  if (scene === 'support') {
    const text = String(body.text ?? '').trim()
    if (!text) {
      sendJson(res, 400, { ok: false, error: 'missing_text' })
      return
    }
    notifyFeishuSupportMerchantMessage({
      sessionId: String(body.sessionId ?? '').trim() || '—',
      enterpriseName: typeof body.enterpriseName === 'string' ? body.enterpriseName : undefined,
      customerId: typeof body.customerId === 'string' ? body.customerId : auth.tenantId,
      text,
      ts: typeof body.ts === 'number' ? body.ts : Date.now(),
    })
    sendJson(res, 200, { ok: true })
    return
  }

  if (scene === 'payment_order') {
    const orderId = String(body.orderId ?? '').trim()
    const orderKind = String(body.orderKind ?? '').trim()
    const amountCents = Number(body.amountCents)
    if (!orderId || !orderKind || !Number.isFinite(amountCents)) {
      sendJson(res, 400, { ok: false, error: 'invalid_payment_payload' })
      return
    }
    notifyFeishuPaymentOrderCreated({
      orderId,
      tenantId: auth.tenantId,
      orderKind,
      amountCents: Math.round(amountCents),
      clientNote: typeof body.clientNote === 'string' ? body.clientNote : null,
    })
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 400, { ok: false, error: 'invalid_scene' })
}
