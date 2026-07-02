/**
 * GET  /api/meoo-douyin-trade-notify — 配置探活
 * POST /api/meoo-douyin-trade-notify — 抖音交易系统支付结果通知（轮询兜底仍可用）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isDouyinOrderPaid, loadDouyinPayConfig } from '../src/lib/douyinTradePay.js'
import { confirmMembershipPayFromSnapshot } from '../src/lib/mpMembershipPayShared.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 30 }

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  try {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body as Record<string, unknown>
    }
    const text =
      typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : ''
    if (!text.trim()) return {}
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    const cfg = loadDouyinPayConfig()
    res.status(200).json({
      ok: true,
      payConfigured: cfg.ok,
      ...(cfg.ok ? { appId: cfg.config.appId, tagGroupId: cfg.config.tagGroupId } : { missing: cfg.missing }),
    })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ err_no: 400, err_tips: 'method_not_allowed' })
    return
  }

  const body = parseJsonBody(req)
  const msg = (body.msg || body.data || body) as Record<string, unknown>
  const outOrderNo = String(
    msg.out_order_no || msg.outOrderNo || body.out_order_no || body.outOrderNo || '',
  ).trim()
  const payStatus = String(msg.pay_status || msg.order_status || body.pay_status || '')
  const orderId = String(msg.order_id || msg.orderId || body.order_id || '').trim()

  if (!outOrderNo || !isDouyinOrderPaid(payStatus)) {
    res.status(200).json({ err_no: 0, err_tips: 'success' })
    return
  }

  const env = readMerchantSupabaseAdminEnv()
  if (env.missingParts.length) {
    res.status(503).json({ err_no: 500, err_tips: 'registry unavailable' })
    return
  }

  const io = createRegistrySnapshotIoFetch(env.supabaseUrl, env.serviceRole)
  const data = await io.load()
  const result = confirmMembershipPayFromSnapshot(data, outOrderNo, {
    transactionId: orderId || undefined,
    channel: 'douyin',
  })
  if (!result.ok && result.error !== 'order_not_found') {
    res.status(500).json({ err_no: 500, err_tips: result.error })
    return
  }
  if (result.ok && !result.already) {
    await io.save(data)
  }

  res.status(200).json({ err_no: 0, err_tips: 'success' })
}
