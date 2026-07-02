/**
 * 支付宝 OpenAPI — 当面付 precreate（扫码）+ 订单查询 + 回调验签
 * 文档：https://opendocs.alipay.com/open/02ekfg
 */
import { createSign, createVerify } from 'node:crypto'

export type AlipayPayConfig = {
  appId: string
  privateKeyPem: string
  alipayPublicKeyPem: string
  notifyUrl: string
}

export type AlipayPayConfigResult =
  | { ok: true; config: AlipayPayConfig }
  | { ok: false; error: string; missing: string[] }

function readPemEnv(name: string): string {
  const raw = String(process.env[name] || '').trim()
  if (!raw) return ''
  if (raw.includes('-----BEGIN')) return raw.replace(/\\n/g, '\n')
  return ''
}

function normalizePrivateKeyPem(pem: string): string {
  const t = pem.trim()
  if (t.includes('BEGIN RSA PRIVATE KEY') || t.includes('BEGIN PRIVATE KEY')) return t
  const body = t.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join('\n')}\n-----END RSA PRIVATE KEY-----`
}

function normalizePublicKeyPem(pem: string): string {
  const t = pem.trim()
  if (t.includes('BEGIN PUBLIC KEY')) return t
  const body = t.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

export function loadAlipayPayConfig(): AlipayPayConfigResult {
  const missing: string[] = []
  const appId = String(process.env.ALIPAY_APP_ID || process.env.ALIPAY_APPID || '').trim()
  const privateKeyPem = normalizePrivateKeyPem(
    readPemEnv('ALIPAY_PRIVATE_KEY') ||
      readPemEnv('ALIPAY_PRIVATE_KEY_PEM') ||
      readPemEnv('ALIPAY_APP_PRIVATE_KEY'),
  )
  const alipayPublicKeyPem = normalizePublicKeyPem(
    readPemEnv('ALIPAY_PUBLIC_KEY') ||
      readPemEnv('ALIPAY_PUBLIC_KEY_PEM') ||
      readPemEnv('ALIPAY_PLATFORM_PUBLIC_KEY'),
  )
  const notifyUrl =
    String(process.env.ALIPAY_NOTIFY_URL || '').trim() ||
    'https://mofangdianai.com/erp-api/meoo-alipay-pay-notify'

  if (!appId) missing.push('ALIPAY_APP_ID')
  if (!privateKeyPem) missing.push('ALIPAY_PRIVATE_KEY')
  if (!alipayPublicKeyPem) missing.push('ALIPAY_PUBLIC_KEY')

  if (missing.length) return { ok: false, error: 'alipay_not_configured', missing }
  return { ok: true, config: { appId, privateKeyPem, alipayPublicKeyPem, notifyUrl } }
}

function formatAlipayTimestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function signAlipayParams(params: Record<string, string>, privateKeyPem: string): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] != null && String(params[k]).trim() !== '')
    .sort()
  const str = sorted.map((k) => `${k}=${params[k]}`).join('&')
  return createSign('RSA-SHA256').update(str, 'utf8').sign(privateKeyPem, 'base64')
}

function parseAlipayGatewayJson(text: string, responseKey: string): Record<string, unknown> {
  let root: Record<string, unknown>
  try {
    root = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('alipay_invalid_json')
  }
  const envelope = root[responseKey] as Record<string, unknown> | undefined
  if (!envelope) throw new Error('alipay_missing_response')
  const code = String(envelope.code || '')
  if (code !== '10000') {
    throw new Error(String(envelope.sub_msg || envelope.msg || `alipay_${code || 'error'}`))
  }
  return envelope
}

async function alipayGatewayCall(
  cfg: AlipayPayConfig,
  method: string,
  bizContent: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const params: Record<string, string> = {
    app_id: cfg.appId,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: formatAlipayTimestamp(),
    version: '1.0',
    notify_url: cfg.notifyUrl,
    biz_content: JSON.stringify(bizContent),
  }
  params.sign = signAlipayParams(params, cfg.privateKeyPem)
  const body = new URLSearchParams(params).toString()
  const res = await fetch('https://openapi.alipay.com/gateway.do', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  })
  const text = await res.text()
  const responseKey = `${method.replace(/\./g, '_')}_response`
  return parseAlipayGatewayJson(text, responseKey)
}

export async function createAlipayPrecreateOrder(opts: {
  cfg: AlipayPayConfig
  outTradeNo: string
  description: string
  amountCents: number
  attach?: string
}): Promise<{ qrCode: string }> {
  const totalAmount = (opts.amountCents / 100).toFixed(2)
  const envelope = await alipayGatewayCall(opts.cfg, 'alipay.trade.precreate', {
    out_trade_no: opts.outTradeNo,
    total_amount: totalAmount,
    subject: opts.description.slice(0, 127),
    body: opts.attach?.slice(0, 128),
    product_code: 'FACE_TO_FACE_PAYMENT',
  })
  const qrCode = String(envelope.qr_code || '').trim()
  if (!qrCode) throw new Error('alipay_missing_qr_code')
  return { qrCode }
}

export async function queryAlipayOrderByOutTradeNo(
  cfg: AlipayPayConfig,
  outTradeNo: string,
): Promise<{ tradeStatus: string; tradeNo?: string }> {
  const envelope = await alipayGatewayCall(cfg, 'alipay.trade.query', {
    out_trade_no: outTradeNo,
  })
  return {
    tradeStatus: String(envelope.trade_status || ''),
    tradeNo: envelope.trade_no ? String(envelope.trade_no) : undefined,
  }
}

export function verifyAlipayNotifySignature(
  params: Record<string, string>,
  cfg: AlipayPayConfig,
): boolean {
  const sign = String(params.sign || '').trim()
  if (!sign) return false
  const sorted = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'sign_type' && params[k] != null && String(params[k]).trim() !== '')
    .sort()
  const str = sorted.map((k) => `${k}=${params[k]}`).join('&')
  try {
    return createVerify('RSA-SHA256')
      .update(str, 'utf8')
      .verify(cfg.alipayPublicKeyPem, sign, 'base64')
  } catch {
    return false
  }
}

export function parseAlipayNotifyParams(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of raw.split('&')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    const k = decodeURIComponent(part.slice(0, i))
    const v = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '))
    out[k] = v
  }
  return out
}
