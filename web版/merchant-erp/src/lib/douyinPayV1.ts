/**
 * 抖音支付商户平台 API（CO_PAY_NATIVE 等）
 * 文档：https://pay.douyinpay.com/  · Native：POST /v1/trade/transactions/native
 */
import { createDecipheriv, createSign, createVerify, randomBytes } from 'node:crypto'

export type DouyinPayMerchantConfig = {
  mchId: string
  appId: string
  serialNo: string
  privateKeyPem: string
  platformPublicKeyPem: string
  encryptKey: string
  notifyUrl: string
}

export type DouyinPayMerchantConfigResult =
  | { ok: true; config: DouyinPayMerchantConfig }
  | { ok: false; error: string; missing: string[] }

function readPemEnv(name: string): string {
  const raw = String(process.env[name] || '').trim()
  if (!raw) return ''
  if (raw.includes('-----BEGIN')) return raw.replace(/\\n/g, '\n')
  return ''
}

function normalizePrivateKeyPem(pem: string): string {
  const t = pem.trim()
  if (t.includes('BEGIN RSA PRIVATE KEY')) {
    return t.replace(/\r\n/g, '\n')
  }
  if (t.includes('BEGIN PRIVATE KEY')) return t.replace(/\r\n/g, '\n')
  const body = t.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`
}

function compactJson(payload: Record<string, unknown>): string {
  return JSON.stringify(payload)
}

function formatDouyinPayApiError(data: Record<string, unknown>, httpStatus: number): string {
  const code = String(data.code || '').trim()
  const message = String(data.message || data.msg || '').trim()
  const detail = String(data.detail || '').trim()
  const parts = [code, message, detail].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return `douyinpay_http_${httpStatus}`
}

function normalizePublicKeyPem(pem: string): string {
  const t = pem.trim()
  if (t.includes('BEGIN')) return t
  const body = t.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

export function loadDouyinPayMerchantConfig(): DouyinPayMerchantConfigResult {
  const missing: string[] = []
  const mchId = String(process.env.DOUYINPAY_MCH_ID || process.env.DOUYIN_PAY_MCH_ID || '').trim()
  const appId = String(
    process.env.DOUYINPAY_APP_ID ||
      process.env.DOUYIN_PAY_APP_ID ||
      process.env.MP_DOUYIN_APPID ||
      '',
  ).trim()
  const serialNo = String(
    process.env.DOUYINPAY_SERIAL_NO || process.env.DOUYIN_PAY_SERIAL_NO || '',
  ).trim()
  const privateKeyPem = normalizePrivateKeyPem(
    readPemEnv('DOUYINPAY_PRIVATE_KEY') ||
      readPemEnv('DOUYIN_PAY_PRIVATE_KEY') ||
      readPemEnv('DOUYIN_PAY_PRIVATE_KEY_PEM'),
  )
  const platformPublicKeyPem = normalizePublicKeyPem(
    readPemEnv('DOUYINPAY_PLATFORM_PUBLIC_KEY') ||
      readPemEnv('DOUYIN_PAY_PLATFORM_PUBLIC_KEY') ||
      readPemEnv('DOUYIN_PAY_PLATFORM_CERT_PEM'),
  )
  const encryptKey = String(
    process.env.DOUYINPAY_ENCRYPT_KEY ||
      process.env.DOUYIN_PAY_ENCRYPT_KEY ||
      process.env.DOUYIN_PAY_API_V3_KEY ||
      '',
  ).trim()
  const notifyUrl =
    String(process.env.DOUYINPAY_NOTIFY_URL || process.env.DOUYIN_PAY_NOTIFY_URL || '').trim() ||
    'https://mofangdianai.com/erp-api/meoo-douyin-pay-notify'

  if (!mchId) missing.push('DOUYINPAY_MCH_ID')
  if (!appId) missing.push('DOUYINPAY_APP_ID')
  if (!serialNo) missing.push('DOUYINPAY_SERIAL_NO')
  if (!privateKeyPem) missing.push('DOUYINPAY_PRIVATE_KEY')
  if (!platformPublicKeyPem) missing.push('DOUYINPAY_PLATFORM_PUBLIC_KEY')
  if (!encryptKey) missing.push('DOUYINPAY_ENCRYPT_KEY')

  if (missing.length) return { ok: false, error: 'douyinpay_not_configured', missing }
  return {
    ok: true,
    config: {
      mchId,
      appId,
      serialNo,
      privateKeyPem,
      platformPublicKeyPem,
      encryptKey,
      notifyUrl,
    },
  }
}

function nonceStr(): string {
  return randomBytes(16).toString('hex')
}

function signAuthorization(
  cfg: DouyinPayMerchantConfig,
  method: string,
  urlPath: string,
  body: string,
): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = nonceStr()
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`
  const signature = createSign('RSA-SHA256').update(message).sign(cfg.privateKeyPem, 'base64')
  return (
    `DouyinPay-RSA mchid="${cfg.mchId}",` +
    `nonce_str="${nonce}",timestamp="${timestamp}",` +
    `serial_no="${cfg.serialNo}",signature="${signature}"`
  )
}

async function douyinPayFetch<T>(
  cfg: DouyinPayMerchantConfig,
  method: 'GET' | 'POST',
  urlPath: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const body = payload ? compactJson(payload) : ''
  const authorization = signAuthorization(cfg, method, urlPath, body)
  const res = await fetch(`https://api.douyinpay.com${urlPath}`, {
    method,
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'meoo-auth-api/douyinpay-v1',
    },
    ...(body ? { body } : {}),
  })
  const text = await res.text()
  let data: unknown = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text.slice(0, 400) }
  }
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(formatDouyinPayApiError(obj, res.status))
  }
  if (obj.code && String(obj.code).toUpperCase() !== 'SUCCESS') {
    throw new Error(formatDouyinPayApiError(obj, res.status))
  }
  return data as T
}

export async function createDouyinPayNativeOrder(opts: {
  cfg: DouyinPayMerchantConfig
  outTradeNo: string
  description: string
  amountCents: number
  attach?: string
}): Promise<{ codeUrl: string; prepayId?: string }> {
  const data = await douyinPayFetch<{
    code_url?: string
    qr_code?: string
    prepay_id?: string
  }>(opts.cfg, 'POST', '/v1/trade/transactions/native', {
    appid: opts.cfg.appId,
    mchid: opts.cfg.mchId,
    description: opts.description.slice(0, 127),
    out_trade_no: opts.outTradeNo,
    notify_url: opts.cfg.notifyUrl,
    amount: { total: opts.amountCents, currency: 'CNY' },
    ...(opts.attach ? { attach: opts.attach.slice(0, 1024) } : {}),
  })
  const codeUrl = String(data.code_url || data.qr_code || '').trim()
  if (!codeUrl) throw new Error('douyinpay_missing_code_url')
  return { codeUrl, prepayId: data.prepay_id ? String(data.prepay_id) : undefined }
}

export async function queryDouyinPayOrderByOutTradeNo(
  cfg: DouyinPayMerchantConfig,
  outTradeNo: string,
): Promise<{ tradeState: string; transactionId?: string }> {
  const urlPath = `/v1/trade/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(cfg.mchId)}`
  const data = await douyinPayFetch<{ trade_state?: string; transaction_id?: string }>(
    cfg,
    'GET',
    urlPath,
  )
  return {
    tradeState: String(data.trade_state || ''),
    transactionId: data.transaction_id ? String(data.transaction_id) : undefined,
  }
}

export function verifyDouyinPayNotifySignature(opts: {
  cfg: DouyinPayMerchantConfig
  timestamp: string
  nonce: string
  body: string
  signature: string
}): boolean {
  const message = `${opts.timestamp}\n${opts.nonce}\n${opts.body}\n`
  try {
    return createVerify('RSA-SHA256')
      .update(message)
      .verify(opts.cfg.platformPublicKeyPem, opts.signature, 'base64')
  } catch {
    return false
  }
}

export function decryptDouyinPayResource(
  encryptKey: string,
  resource: { ciphertext: string; nonce: string; associated_data?: string },
): Record<string, unknown> {
  const key = Buffer.from(encryptKey, 'utf8')
  const buf = Buffer.from(resource.ciphertext, 'base64')
  const authTag = buf.subarray(buf.length - 16)
  const data = buf.subarray(0, buf.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce, 'utf8'))
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'))
  }
  decipher.setAuthTag(authTag)
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  return JSON.parse(plain) as Record<string, unknown>
}

export function isDouyinPayOrderSuccess(tradeState: string): boolean {
  const s = String(tradeState || '').trim().toUpperCase()
  return s === 'SUCCESS'
}
