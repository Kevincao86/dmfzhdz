/**
 * GET  /api/meoo-wechat-pay-notify — 配置探活（不含密钥）
 * POST /api/meoo-wechat-pay-notify — 微信支付结果通知（Native / JSAPI）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { confirmMembershipWechatPayFromSnapshot } from '../src/lib/mpMembershipWechatPayMutations.js'
import { confirmPointsWechatPayFromSnapshot } from '../src/lib/mpPointsWechatPayMutations.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { confirmTenantPayFromNotify } from '../src/lib/tenantPaymentChannels.js'
import {
  decryptWechatPayResource,
  loadWechatPayConfig,
  verifyWechatPayNotifySignature,
} from '../src/lib/wechatPayV3.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 30 }

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

function headerOne(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()]
  if (Array.isArray(v)) return String(v[0] || '').trim()
  return String(v || '').trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    const cfg = loadWechatPayConfig()
    res.status(200).json({
      ok: true,
      payConfigured: cfg.ok,
      ...(cfg.ok
        ? { notifyUrl: cfg.config.notifyUrl, mchId: cfg.config.mchId, appId: cfg.config.appId }
        : { missing: cfg.missing }),
    })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const cfgResult = loadWechatPayConfig()
  if (!cfgResult.ok) {
    res.status(503).json({ code: 'FAIL', message: 'pay not configured' })
    return
  }
  const cfg = cfgResult.config

  const bodyText = rawBody(req)
  const timestamp = headerOne(req, 'wechatpay-timestamp')
  const nonce = headerOne(req, 'wechatpay-nonce')
  const signature = headerOne(req, 'wechatpay-signature')

  if (
    !verifyWechatPayNotifySignature({
      cfg,
      timestamp,
      nonce,
      body: bodyText,
      signature,
    })
  ) {
    res.status(401).json({ code: 'FAIL', message: 'invalid signature' })
    return
  }

  let envelope: Record<string, unknown>
  try {
    envelope = JSON.parse(bodyText) as Record<string, unknown>
  } catch {
    res.status(400).json({ code: 'FAIL', message: 'invalid json' })
    return
  }

  const resource = envelope.resource
  if (!resource || typeof resource !== 'object') {
    res.status(400).json({ code: 'FAIL', message: 'missing resource' })
    return
  }

  let plain: Record<string, unknown>
  try {
    plain = decryptWechatPayResource(cfg.apiV3Key, resource as {
      ciphertext: string
      nonce: string
      associated_data?: string
    })
  } catch {
    res.status(400).json({ code: 'FAIL', message: 'decrypt failed' })
    return
  }

  const tradeState = String(plain.trade_state || '')
  const outTradeNo = String(plain.out_trade_no || '').trim()
  const transactionId = String(plain.transaction_id || '').trim()

  if (tradeState !== 'SUCCESS' || !outTradeNo) {
    res.status(200).json({ code: 'SUCCESS', message: '成功' })
    return
  }

  if (outTradeNo.startsWith('TERP')) {
    const env = readMerchantSupabaseAdminEnv()
    if (env.missingParts.length) {
      res.status(503).json({ code: 'FAIL', message: 'tenant billing unavailable' })
      return
    }
    const admin = createClient(env.supabaseUrl, env.serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const ok = await confirmTenantPayFromNotify(admin, outTradeNo, transactionId)
    if (!ok) {
      res.status(500).json({ code: 'FAIL', message: 'tenant_confirm_failed' })
      return
    }
    res.status(200).json({ code: 'SUCCESS', message: '成功' })
    return
  }

  const env = readMerchantSupabaseAdminEnv()
  if (env.missingParts.length) {
    res.status(503).json({ code: 'FAIL', message: 'registry unavailable' })
    return
  }

  const io = createRegistrySnapshotIoFetch(env.supabaseUrl, env.serviceRole)
  const data = await io.load()
  const membershipResult = confirmMembershipWechatPayFromSnapshot(data, outTradeNo, {
    transactionId: transactionId || undefined,
    channel: 'wechat',
  })
  if (membershipResult.ok) {
    if (!membershipResult.already) {
      await io.save(data)
    }
    res.status(200).json({ code: 'SUCCESS', message: '成功' })
    return
  }
  if (membershipResult.error !== 'order_not_found') {
    res.status(500).json({ code: 'FAIL', message: membershipResult.error })
    return
  }

  const pointsResult = confirmPointsWechatPayFromSnapshot(
    data,
    outTradeNo,
    transactionId ? { transactionId } : undefined,
  )
  if (!pointsResult.ok) {
    res.status(500).json({ code: 'FAIL', message: pointsResult.error })
    return
  }
  if (!pointsResult.already) {
    await io.save(data)
  }

  res.status(200).json({ code: 'SUCCESS', message: '成功' })
}
