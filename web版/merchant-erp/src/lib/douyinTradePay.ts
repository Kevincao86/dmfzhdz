/**
 * 抖音小程序通用交易系统 — requestOrder 签名 + 订单查询
 * 文档：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/trade-system/general/order/request-order-data-sign
 */
import { createSign, randomBytes } from 'node:crypto'
import { exchangeDouyinClientToken } from '../../api/douyinOpenApiBase.js'

export type DouyinPayConfig = {
  appId: string
  privateKeyPem: string
  keyVersion: string
  tagGroupId: string
  skuId: string
  orderEntryPath: string
  payNotifyUrl: string
}

export type DouyinPayConfigResult =
  | { ok: true; config: DouyinPayConfig }
  | { ok: false; error: string; missing: string[] }

function readPemEnv(name: string): string {
  const raw = String(process.env[name] || '').trim()
  if (!raw) return ''
  if (raw.includes('-----BEGIN')) return raw.replace(/\\n/g, '\n')
  return ''
}

function normalizePrivateKeyPem(pem: string): string {
  const t = pem.trim()
  if (t.includes('BEGIN')) return t
  const body = t.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`
}

export function loadDouyinPayConfig(): DouyinPayConfigResult {
  const missing: string[] = []
  const appId = String(
    process.env.DOUYIN_PAY_APP_ID ||
      process.env.MP_DOUYIN_APPID ||
      process.env.DOUYIN_APPID ||
      '',
  ).trim()
  const privateKeyPem = normalizePrivateKeyPem(
    readPemEnv('DOUYIN_PAY_PRIVATE_KEY') ||
      readPemEnv('DOUYIN_TRADE_PRIVATE_KEY') ||
      readPemEnv('DOUYIN_PAY_PRIVATE_KEY_PEM'),
  )
  const keyVersion = String(process.env.DOUYIN_PAY_KEY_VERSION || '1').trim() || '1'
  const tagGroupId = String(process.env.DOUYIN_TRADE_TAG_GROUP_ID || '').trim()
  const skuId = String(process.env.DOUYIN_TRADE_SKU_ID || 'xingxuan_membership').trim()
  const orderEntryPath = String(
    process.env.DOUYIN_TRADE_ORDER_ENTRY_PATH || 'pages/mine-xingxuan-membership/mine-xingxuan-membership',
  ).trim()
  const payNotifyUrl =
    String(process.env.DOUYIN_TRADE_PAY_NOTIFY_URL || '').trim() ||
    'https://mofangdianai.com/erp-api/meoo-douyin-trade-notify'

  if (!appId) missing.push('DOUYIN_PAY_APP_ID')
  if (!privateKeyPem) missing.push('DOUYIN_PAY_PRIVATE_KEY')
  if (!tagGroupId) missing.push('DOUYIN_TRADE_TAG_GROUP_ID')

  if (missing.length) return { ok: false, error: 'douyin_pay_not_configured', missing }
  return {
    ok: true,
    config: { appId, privateKeyPem, keyVersion, tagGroupId, skuId, orderEntryPath, payNotifyUrl },
  }
}

function signRequestOrderRaw(
  privateKeyPem: string,
  timestamp: number,
  nonceStr: string,
  data: string,
): string {
  const rawStr = `POST\n/requestOrder\n${timestamp}\n${nonceStr}\n${data}\n`
  return createSign('RSA-SHA256').update(rawStr, 'utf8').sign(privateKeyPem, 'base64')
}

export function buildDouyinRequestOrderAuthorization(
  cfg: DouyinPayConfig,
  data: string,
): { data: string; byteAuthorization: string; timestamp: number; nonceStr: string } {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonceStr = randomBytes(8).toString('hex')
  const signature = signRequestOrderRaw(cfg.privateKeyPem, timestamp, nonceStr, data)
  const byteAuthorization =
    `SHA256-RSA2048 appid=${cfg.appId},nonce_str=${nonceStr},timestamp=${timestamp},` +
    `key_version=${cfg.keyVersion},signature=${signature}`
  return { data, byteAuthorization, timestamp, nonceStr }
}

export function buildDouyinMembershipOrderData(opts: {
  cfg: DouyinPayConfig
  outOrderNo: string
  totalAmountCents: number
  title: string
  imageUrl?: string
}): string {
  const payload = {
    skuList: [
      {
        tagGroupId: opts.cfg.tagGroupId,
        skuId: opts.cfg.skuId,
        title: opts.title.slice(0, 60),
        price: opts.totalAmountCents,
        quantity: 1,
        type: 301,
        imageList: [opts.imageUrl || 'https://mofangdianai.com/erp-api/static/payment/douyin-sku.png'],
      },
    ],
    outOrderNo: opts.outOrderNo,
    totalAmount: opts.totalAmountCents,
    payExpireSeconds: 900,
    limitPayWayList: [],
    payNotifyUrl: opts.cfg.payNotifyUrl,
    orderEntrySchema: {
      path: opts.cfg.orderEntryPath,
      params: JSON.stringify({ outOrderNo: opts.outOrderNo }),
    },
  }
  return JSON.stringify(payload)
}

export async function queryDouyinOrderByOutOrderNo(
  outOrderNo: string,
): Promise<{ payStatus: string; orderId?: string }> {
  const clientKey = String(
    process.env.DOUYIN_PAY_APP_ID ||
      process.env.MP_DOUYIN_APPID ||
      process.env.DOUYIN_APPID ||
      '',
  ).trim()
  const clientSecret = String(process.env.MP_DOUYIN_SECRET || process.env.DOUYIN_SECRET || '').trim()
  if (!clientKey || !clientSecret) throw new Error('douyin_client_token_unconfigured')

  const tokenResult = await exchangeDouyinClientToken({ clientKey, clientSecret })
  const accessToken = tokenResult.token

  const res = await fetch('https://open.douyin.com/api/trade_basic/v1/developer/order_query/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'access-token': accessToken,
    },
    body: JSON.stringify({ out_order_no: outOrderNo }),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('douyin_query_invalid_json')
  }
  const errNo = Number(json.err_no ?? json.errno ?? -1)
  if (errNo !== 0) {
    throw new Error(String(json.err_tips || json.err_msg || `douyin_query_${errNo}`))
  }
  const data = (json.data || {}) as Record<string, unknown>
  return {
    payStatus: String(data.pay_status || data.order_status || ''),
    orderId: data.order_id ? String(data.order_id) : undefined,
  }
}

export function isDouyinOrderPaid(payStatus: string): boolean {
  const s = String(payStatus || '').trim().toUpperCase()
  return s === 'SUCCESS' || s === 'PAID'
}

async function readDouyinClientAccessToken(): Promise<string> {
  const clientKey = String(
    process.env.DOUYIN_PAY_APP_ID ||
      process.env.MP_DOUYIN_APPID ||
      process.env.DOUYIN_APPID ||
      '',
  ).trim()
  const clientSecret = String(process.env.MP_DOUYIN_SECRET || process.env.DOUYIN_SECRET || '').trim()
  if (!clientKey || !clientSecret) throw new Error('douyin_client_token_unconfigured')
  const tokenResult = await exchangeDouyinClientToken({ clientKey, clientSecret })
  return tokenResult.token
}

/** PC Native 扫码：生成抖音小程序码，用户用抖音 App 扫码后在小程序内完成支付 */
export async function createDouyinMiniProgramPayQr(opts: {
  cfg: DouyinPayConfig
  outOrderNo: string
}): Promise<string> {
  const accessToken = await readDouyinClientAccessToken()
  const pagePath = `${opts.cfg.orderEntryPath}?outOrderNo=${encodeURIComponent(opts.outOrderNo)}&autoPay=1`
  const res = await fetch('https://open.douyin.com/api/apps/v1/qrcode/create/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'access-token': accessToken,
    },
    body: JSON.stringify({
      appid: opts.cfg.appId,
      app_name: 'douyin',
      path: encodeURIComponent(pagePath),
      width: 430,
      set_icon: true,
    }),
  })

  const contentType = String(res.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('image/')) {
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = contentType.split(';')[0]?.trim() || 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  }

  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('douyin_qr_invalid_response')
  }
  const errNo = Number(json.err_no ?? json.errno ?? -1)
  if (errNo !== 0) {
    throw new Error(String(json.err_tips || json.err_msg || `douyin_qr_${errNo}`))
  }
  const data = (json.data || {}) as Record<string, unknown>
  const imgRaw = String(data.img || data.image || data.qrcode || '').trim()
  if (!imgRaw) throw new Error('douyin_qr_missing_image')
  if (/^data:image\//i.test(imgRaw)) return imgRaw
  if (/^https?:\/\//i.test(imgRaw)) return imgRaw
  return `data:image/png;base64,${imgRaw}`
}

export function buildDouyinLaunchPayForCheckout(
  cfg: DouyinPayConfig,
  checkout: {
    outTradeNo?: string
    amountCents: number
    planId: string
    billing: 'monthly' | 'yearly'
  },
  title: string,
): { data: string; byteAuthorization: string } {
  const orderData = buildDouyinMembershipOrderData({
    cfg,
    outOrderNo: checkout.outTradeNo!,
    totalAmountCents: checkout.amountCents,
    title,
  })
  return buildDouyinRequestOrderAuthorization(cfg, orderData)
}
