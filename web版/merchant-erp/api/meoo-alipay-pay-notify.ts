/**
 * GET  /api/meoo-alipay-pay-notify — 配置探活（?detail=1&probePay=1）
 * POST /api/meoo-alipay-pay-notify — 支付宝异步通知（电脑网站支付 / 当面付）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildAlipayPagePayUrl,
  createAlipayPrecreateOrder,
  describeAlipayPayKeySources,
  fetchAlipayPagePayQrCode,
  loadAlipayPayConfig,
  parseAlipayNotifyParams,
  testAlipayPrivateKeySign,
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
    const detail = String(req.query?.detail || req.query?.diagnose || '').trim() === '1'
    const probePay =
      String(req.query?.probePay || req.query?.probePrecreate || '').trim() === '1'

    const base: Record<string, unknown> = {
      ok: true,
      payConfigured: cfg.ok,
    }

    if (!cfg.ok) {
      base.missing = cfg.missing
      res.status(200).json(base)
      return
    }

    base.notifyUrl = cfg.config.notifyUrl
    base.returnUrl = cfg.config.returnUrl
    base.appId = cfg.config.appId
    base.payProduct = cfg.config.payProduct
    base.apiMethod =
      cfg.config.payProduct === 'precreate'
        ? 'alipay.trade.precreate'
        : 'alipay.trade.page.pay'

    if (detail || probePay) {
      const keySources = describeAlipayPayKeySources()
      const signProbe = testAlipayPrivateKeySign(cfg.config)
      base.privateKeySignOk = signProbe.ok
      if (!signProbe.ok) base.privateKeySignError = signProbe.error
      base.privateKeySource = keySources.privateKeySource
      base.publicKeySource = keySources.publicKeySource
    }

    if (probePay) {
      const outTradeNo = `PROBE_${Date.now()}`
      if (cfg.config.payProduct === 'precreate') {
        try {
          const order = await createAlipayPrecreateOrder({
            cfg: cfg.config,
            outTradeNo,
            description: '灵祺探活',
            amountCents: 1,
          })
          base.payProbe = {
            ok: true,
            mode: 'precreate',
            outTradeNo,
            qrCodeLen: order.qrCode.length,
            qrCodePrefix: order.qrCode.slice(0, 32),
          }
        } catch (e) {
          base.payProbe = {
            ok: false,
            mode: 'precreate',
            outTradeNo,
            error: e instanceof Error ? e.message : String(e),
          }
        }
      } else {
        try {
          const payPageUrl = buildAlipayPagePayUrl({
            cfg: cfg.config,
            outTradeNo,
            description: '灵祺探活',
            amountCents: 1,
          })
          let qrCode = ''
          try {
            qrCode = await fetchAlipayPagePayQrCode(payPageUrl)
          } catch {
            qrCode = ''
          }
          base.payProbe = {
            ok: true,
            mode: 'page',
            outTradeNo,
            payPageUrlLen: payPageUrl.length,
            payPageUrlPrefix: payPageUrl.slice(0, 48),
            qrCodeLen: qrCode.length,
            qrCodePrefix: qrCode.slice(0, 48),
            qrExtracted: Boolean(qrCode),
          }
        } catch (e) {
          base.payProbe = {
            ok: false,
            mode: 'page',
            outTradeNo,
            error: e instanceof Error ? e.message : String(e),
          }
        }
      }
    }

    res.status(200).json(base)
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
