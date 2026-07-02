/**
 * GET  /api/meoo-douyin-pay-notify — 抖音支付（CO_PAY_NATIVE）配置探活
 * POST /api/meoo-douyin-pay-notify — 抖音支付商户平台异步通知
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  createDouyinPayNativeOrder,
  decryptDouyinPayResource,
  describeDouyinPayKeySources,
  isDouyinPayOrderSuccess,
  loadDouyinPayMerchantConfig,
  testDouyinPayPrivateKeySign,
  verifyDouyinPayNotifySignature,
} from '../src/lib/douyinPayV1.js'
import { confirmMembershipPayFromSnapshot } from '../src/lib/mpMembershipPayShared.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
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
    const cfg = loadDouyinPayMerchantConfig()
    const detail = String(req.query?.detail || req.query?.diagnose || '').trim() === '1'
    const probeNative = String(req.query?.probeNative || '').trim() === '1'

    const base: Record<string, unknown> = {
      ok: true,
      payConfigured: cfg.ok,
      product: 'CO_PAY_NATIVE',
    }

    if (!cfg.ok) {
      base.missing = cfg.missing
      res.status(200).json(base)
      return
    }

    base.notifyUrl = cfg.config.notifyUrl
    base.mchId = cfg.config.mchId
    base.appId = cfg.config.appId

    if (detail || probeNative) {
      const keySources = describeDouyinPayKeySources()
      const signProbe = testDouyinPayPrivateKeySign(cfg.config)
      base.privateKeySignOk = signProbe.ok
      if (!signProbe.ok) base.privateKeySignError = signProbe.error
      base.privateKeySource = keySources.privateKeySource
      base.platformKeySource = keySources.platformKeySource
      base.encryptKeyLen = cfg.config.encryptKey.length
      base.serialNoTail = cfg.config.serialNo.slice(-6)
    }

    if (probeNative) {
      const outTradeNo = `PROBE_${Date.now()}`
      try {
        const order = await createDouyinPayNativeOrder({
          cfg: cfg.config,
          outTradeNo,
          description: '灵祺探活',
          amountCents: 1,
        })
        base.nativeProbe = {
          ok: true,
          outTradeNo,
          codeUrlLen: order.codeUrl.length,
          codeUrlPrefix: order.codeUrl.slice(0, 32),
        }
      } catch (e) {
        base.nativeProbe = {
          ok: false,
          outTradeNo,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    }

    res.status(200).json(base)
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ code: 'FAIL', message: 'method_not_allowed' })
    return
  }

  const cfgResult = loadDouyinPayMerchantConfig()
  if (!cfgResult.ok) {
    res.status(503).json({ code: 'FAIL', message: 'pay not configured' })
    return
  }
  const cfg = cfgResult.config

  const bodyText = rawBody(req)
  const timestamp = headerOne(req, 'douyinpay-timestamp')
  const nonce = headerOne(req, 'douyinpay-nonce')
  const signature = headerOne(req, 'douyinpay-signature')

  if (
    !verifyDouyinPayNotifySignature({
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
    plain = decryptDouyinPayResource(cfg.encryptKey, resource as {
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

  if (!isDouyinPayOrderSuccess(tradeState) || !outTradeNo) {
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
  const result = confirmMembershipPayFromSnapshot(data, outTradeNo, {
    transactionId: transactionId || undefined,
    channel: 'douyin',
  })
  if (!result.ok && result.error !== 'order_not_found') {
    res.status(500).json({ code: 'FAIL', message: result.error })
    return
  }
  if (result.ok && !result.already) {
    await io.save(data)
  }

  res.status(200).json({ code: 'SUCCESS', message: '成功' })
}
