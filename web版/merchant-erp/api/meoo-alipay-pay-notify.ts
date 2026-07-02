/**
 * GET  /api/meoo-alipay-pay-notify — 配置探活
 * POST /api/meoo-alipay-pay-notify — 支付宝当面付异步通知
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  loadAlipayPayConfig,
  parseAlipayNotifyParams,
  verifyAlipayNotifySignature,
} from '../src/lib/alipayPay.js'
import { confirmMembershipPayFromSnapshot } from '../src/lib/mpMembershipPayShared.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 30 }

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') {
      const o = req.body as Record<string, string>
      return Object.keys(o)
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(o[k] ?? '')}`)
        .join('&')
    }
    return ''
  } catch {
    return ''
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    const cfg = loadAlipayPayConfig()
    res.status(200).json({
      ok: true,
      payConfigured: cfg.ok,
      ...(cfg.ok ? { notifyUrl: cfg.config.notifyUrl, appId: cfg.config.appId } : { missing: cfg.missing }),
    })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).send('failure')
    return
  }

  const cfgResult = loadAlipayPayConfig()
  if (!cfgResult.ok) {
    res.status(503).send('failure')
    return
  }
  const cfg = cfgResult.config

  const bodyText = rawBody(req)
  const params =
    req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? (req.body as Record<string, string>)
      : parseAlipayNotifyParams(bodyText)

  if (!verifyAlipayNotifySignature(params, cfg)) {
    res.status(401).send('failure')
    return
  }

  const tradeStatus = String(params.trade_status || '')
  const outTradeNo = String(params.out_trade_no || '').trim()
  const tradeNo = String(params.trade_no || '').trim()

  if (
    (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') ||
    !outTradeNo
  ) {
    res.status(200).send('success')
    return
  }

  const env = readMerchantSupabaseAdminEnv()
  if (env.missingParts.length) {
    res.status(503).send('failure')
    return
  }

  const io = createRegistrySnapshotIoFetch(env.supabaseUrl, env.serviceRole)
  const data = await io.load()
  const result = confirmMembershipPayFromSnapshot(data, outTradeNo, {
    transactionId: tradeNo || undefined,
    channel: 'alipay',
  })
  if (!result.ok && result.error !== 'order_not_found') {
    res.status(500).send('failure')
    return
  }
  if (result.ok && !result.already) {
    await io.save(data)
  }

  res.status(200).send('success')
}
