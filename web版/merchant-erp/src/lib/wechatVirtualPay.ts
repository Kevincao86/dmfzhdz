/**
 * 微信小程序虚拟支付（米大师 xpay）— 商家 ERP 小程序专用。
 * 客户端调 wx.requestVirtualPayment；签名与查单在此完成。
 */
import { createHmac } from 'node:crypto'
import { erpMpWechatCredentials } from './erpMpWechatAccess.js'

export type WechatVirtualPayConfig = {
  offerId: string
  appKey: string
  env: 0 | 1
  productMap: Record<string, string>
}

export type VirtualPayClientParams = {
  mode: 'short_series_goods'
  signData: string
  paySig: string
  signature: string
}

let erpXpayTokenCache: { token: string; expiresAt: number } | null = null

export function loadWechatVirtualPayConfig():
  | { ok: true; config: WechatVirtualPayConfig }
  | { ok: false; error: string; missing: string[] } {
  const offerId = String(process.env.ERP_MP_XPAY_OFFER_ID || process.env.WECHAT_XPAY_OFFER_ID || '').trim()
  const envRaw = String(process.env.ERP_MP_XPAY_ENV || process.env.WECHAT_XPAY_ENV || '0').trim()
  const env: 0 | 1 = envRaw === '1' ? 1 : 0
  const appKey = String(
    env === 1
      ? process.env.ERP_MP_XPAY_APP_KEY_SANDBOX ||
          process.env.WECHAT_XPAY_APP_KEY_SANDBOX ||
          process.env.ERP_MP_XPAY_APP_KEY ||
          ''
      : process.env.ERP_MP_XPAY_APP_KEY || process.env.WECHAT_XPAY_APP_KEY || '',
  ).trim()
  const missing: string[] = []
  if (!offerId) missing.push('ERP_MP_XPAY_OFFER_ID')
  if (!appKey) missing.push(env === 1 ? 'ERP_MP_XPAY_APP_KEY_SANDBOX' : 'ERP_MP_XPAY_APP_KEY')
  if (missing.length) return { ok: false, error: 'xpay_not_configured', missing }

  let productMap: Record<string, string> = {}
  const mapRaw = String(process.env.ERP_MP_XPAY_PRODUCT_MAP || process.env.WECHAT_XPAY_PRODUCT_MAP || '').trim()
  if (mapRaw) {
    try {
      const parsed = JSON.parse(mapRaw) as Record<string, unknown>
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim()) productMap[String(k).trim()] = v.trim()
      }
    } catch {
      return { ok: false, error: 'xpay_product_map_invalid', missing: ['ERP_MP_XPAY_PRODUCT_MAP'] }
    }
  }

  return { ok: true, config: { offerId, appKey, env, productMap } }
}

/** 金额分 → 道具 ID；优先读 PRODUCT_MAP，否则约定 erp_{kind}_{cents} */
export function resolveXpayProductId(
  config: WechatVirtualPayConfig,
  orderKind: string,
  amountCents: number,
): string {
  const cents = Math.floor(Number(amountCents) || 0)
  const kind = String(orderKind || '').trim()
  const map = config.productMap
  return (
    map[`${kind}:${cents}`] ||
    map[String(cents)] ||
    map[kind] ||
    `erp_${kind || 'item'}_${cents}`
  )
}

export function hmacSha256Hex(key: string, message: string): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex')
}

/** 客户端 requestVirtualPayment：uri 固定为 requestVirtualPayment */
export function buildVirtualPaymentClientParams(input: {
  config: WechatVirtualPayConfig
  sessionKey: string
  outTradeNo: string
  productId: string
  goodsPriceCents: number
  attach: string
  buyQuantity?: number
}): VirtualPayClientParams {
  const signObj = {
    offerId: input.config.offerId,
    buyQuantity: Math.max(1, Math.floor(Number(input.buyQuantity) || 1)),
    env: input.config.env,
    currencyType: 'CNY',
    productId: input.productId,
    goodsPrice: Math.max(1, Math.floor(Number(input.goodsPriceCents) || 0)),
    outTradeNo: input.outTradeNo,
    attach: String(input.attach || '').slice(0, 1024),
  }
  const signData = JSON.stringify(signObj)
  const paySig = hmacSha256Hex(input.config.appKey, `requestVirtualPayment&${signData}`)
  const signature = hmacSha256Hex(input.sessionKey, signData)
  return {
    mode: 'short_series_goods',
    signData,
    paySig,
    signature,
  }
}

export function buildXpayPaySig(appKey: string, uri: string, postBody: string): string {
  return hmacSha256Hex(appKey, `${uri}&${postBody}`)
}

async function getErpMpAccessToken(): Promise<string> {
  const { appId, secret } = erpMpWechatCredentials()
  if (!appId || !secret) throw new Error('erp_wx_not_configured')
  const now = Date.now()
  if (erpXpayTokenCache && erpXpayTokenCache.expiresAt > now + 60_000) {
    return erpXpayTokenCache.token
  }
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`
  const res = await fetch(url)
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }
  if (!data.access_token) {
    throw new Error(data.errmsg || `wx_token_${data.errcode ?? res.status}`)
  }
  erpXpayTokenCache = {
    token: data.access_token,
    expiresAt: now + Math.max(300, Number(data.expires_in || 7200) - 120) * 1000,
  }
  return erpXpayTokenCache.token
}

/**
 * 查询虚拟支付现金单状态。
 * @see https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html
 */
export async function queryXpayOrder(input: {
  config: WechatVirtualPayConfig
  outTradeNo: string
  openid?: string
}): Promise<{ paid: boolean; transactionId?: string; raw?: Record<string, unknown> }> {
  const bodyObj: Record<string, unknown> = {
    env: input.config.env,
    order_id: input.outTradeNo,
  }
  if (input.openid) bodyObj.openid = input.openid
  const postBody = JSON.stringify(bodyObj)
  const uri = '/xpay/query_order'
  const paySig = buildXpayPaySig(input.config.appKey, uri, postBody)
  const token = await getErpMpAccessToken()
  const url = `https://api.weixin.qq.com${uri}?access_token=${encodeURIComponent(token)}&pay_sig=${encodeURIComponent(paySig)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: postBody,
  })
  const data = (await res.json()) as Record<string, unknown>
  const errcode = Number(data.errcode ?? data.ErrCode ?? 0)
  if (errcode !== 0) {
    const msg = String(data.errmsg || data.ErrMsg || `xpay_query_${errcode}`)
    throw new Error(msg)
  }
  const order = (data.order as Record<string, unknown> | undefined) || data
  const status = Number(order.status ?? order.order_status ?? order.Status ?? -1)
  // 常见：0 初始 1 下单 2 支付成功 … 以 paid/支付成功 文案或 status==2 为准
  const statusText = String(order.status_msg || order.StatusMsg || '').toLowerCase()
  const paid =
    status === 2 ||
    status === 3 ||
    /paid|success|支付成功|已支付/.test(statusText) ||
    Boolean(order.paid_time || order.PaidTime || order.wx_order_id)
  const transactionId = String(
    order.wx_order_id || order.transaction_id || order.TransactionId || order.order_id || '',
  ).trim()
  return { paid, transactionId: transactionId || undefined, raw: data }
}

export function parseXpayOpenIdFromClientNote(clientNote: string | null | undefined): string {
  const raw = String(clientNote || '').trim()
  if (!raw) return ''
  try {
    const j = JSON.parse(raw) as { xpayOpenId?: string }
    if (j && typeof j.xpayOpenId === 'string') return j.xpayOpenId.trim()
  } catch {
    /* ignore */
  }
  const m = raw.match(/xpayOpenId=([A-Za-z0-9_-]+)/)
  return m?.[1] ? m[1] : ''
}

export function mergeXpayOpenIdIntoClientNote(
  clientNote: string | null | undefined,
  openid: string,
): string {
  const oid = String(openid || '').trim()
  const base = String(clientNote || '').trim()
  let obj: Record<string, unknown> = {}
  if (base) {
    try {
      const parsed = JSON.parse(base) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') obj = parsed
      else obj = { note: base }
    } catch {
      obj = { note: base }
    }
  }
  if (oid) obj.xpayOpenId = oid
  return JSON.stringify(obj).slice(0, 500)
}
