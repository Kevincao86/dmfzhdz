/**
 * 抖音支付商户平台 API（CO_PAY_NATIVE 等）
 * 文档：https://pay.douyinpay.com/  · Native：POST /v1/trade/transactions/native
 */
import {
  createDecipheriv,
  createPrivateKey,
  createSign,
  createVerify,
  randomBytes,
  type KeyObject,
} from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

function expandHome(p: string): string {
  const t = String(p || '').trim()
  if (!t) return ''
  if (t.startsWith('~/')) return path.join(os.homedir(), t.slice(2))
  return t
}

function unescapePemText(raw: string): string {
  let t = String(raw || '').trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim()
  }
  while (t.includes('\\n')) t = t.replace(/\\n/g, '\n')
  return t.replace(/\r\n/g, '\n')
}

function readPemEnv(name: string): string {
  const raw = String(process.env[name] || '').trim()
  if (!raw) return ''
  if (raw.includes('-----BEGIN')) return unescapePemText(raw)
  return ''
}

function readPemFile(filePath: string): string {
  const fp = expandHome(filePath)
  if (!fp || !fs.existsSync(fp)) return ''
  try {
    return unescapePemText(fs.readFileSync(fp, 'utf8'))
  } catch {
    return ''
  }
}

function readPemMaterial(opts: {
  inlineEnvNames: string[]
  fileEnvNames: string[]
  defaultFilePaths: string[]
}): { pem: string; source: string } {
  for (const name of opts.fileEnvNames) {
    const fp = expandHome(String(process.env[name] || '').trim())
    if (!fp) continue
    const pem = readPemFile(fp)
    if (pem) return { pem, source: `file:${name}` }
  }
  for (const fp of opts.defaultFilePaths) {
    const pem = readPemFile(fp)
    if (pem) return { pem, source: `file:${fp}` }
  }
  for (const name of opts.inlineEnvNames) {
    const pem = readPemEnv(name)
    if (pem) return { pem, source: `env:${name}` }
  }
  return { pem: '', source: '' }
}

function normalizePrivateKeyPem(pem: string): string {
  const t = unescapePemText(pem)
  if (!t) return ''
  if (t.includes('BEGIN ENCRYPTED PRIVATE KEY')) {
    throw new Error('douyinpay_private_key_encrypted')
  }
  if (t.includes('BEGIN RSA PRIVATE KEY')) {
    try {
      const keyObj = createPrivateKey({ key: t, format: 'pem', type: 'pkcs1' })
      return keyObj.export({ type: 'pkcs8', format: 'pem' }).toString()
    } catch {
      return t
    }
  }
  if (t.includes('BEGIN PRIVATE KEY')) return t
  const body = t.replace(/\s+/g, '')
  if (!body) return ''
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`
}

function loadPrivateKeyObject(privateKeyPem: string): KeyObject {
  const pem = normalizePrivateKeyPem(privateKeyPem)
  if (!pem) throw new Error('douyinpay_private_key_missing')
  try {
    return createPrivateKey(pem)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`douyinpay_private_key_invalid: ${msg}`)
  }
}

function signWithPrivateKey(privateKeyPem: string, message: string): string {
  const key = loadPrivateKeyObject(privateKeyPem)
  return createSign('RSA-SHA256').update(message).sign(key, 'base64')
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
  const t = unescapePemText(pem)
  if (!t) return ''
  if (t.includes('BEGIN')) return t
  const body = t.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

/** 探活：商户私钥能否正常 RSA-SHA256 签名 */
export function testDouyinPayPrivateKeySign(
  cfg: DouyinPayMerchantConfig,
): { ok: true } | { ok: false; error: string } {
  try {
    signWithPrivateKey(cfg.privateKeyPem, 'meoo-douyinpay-sign-probe')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function describeDouyinPayKeySources(): {
  privateKeySource: string
  platformKeySource: string
} {
  const priv = readPemMaterial({
    inlineEnvNames: ['DOUYINPAY_PRIVATE_KEY', 'DOUYIN_PAY_PRIVATE_KEY', 'DOUYIN_PAY_PRIVATE_KEY_PEM'],
    fileEnvNames: ['DOUYINPAY_PRIVATE_KEY_FILE', 'DOUYIN_PAY_PRIVATE_KEY_FILE'],
    defaultFilePaths: ['~/stack/douyinpay-private.pem'],
  })
  const plat = readPemMaterial({
    inlineEnvNames: [
      'DOUYINPAY_PLATFORM_PUBLIC_KEY',
      'DOUYIN_PAY_PLATFORM_PUBLIC_KEY',
      'DOUYIN_PAY_PLATFORM_CERT_PEM',
    ],
    fileEnvNames: ['DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE', 'DOUYIN_PAY_PLATFORM_PUBLIC_KEY_FILE'],
    defaultFilePaths: ['~/stack/douyinpay-platform-public.pem'],
  })
  return { privateKeySource: priv.source, platformKeySource: plat.source }
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
  const privateKeyMaterial = readPemMaterial({
    inlineEnvNames: ['DOUYINPAY_PRIVATE_KEY', 'DOUYIN_PAY_PRIVATE_KEY', 'DOUYIN_PAY_PRIVATE_KEY_PEM'],
    fileEnvNames: ['DOUYINPAY_PRIVATE_KEY_FILE', 'DOUYIN_PAY_PRIVATE_KEY_FILE'],
    defaultFilePaths: ['~/stack/douyinpay-private.pem'],
  })
  const platformKeyMaterial = readPemMaterial({
    inlineEnvNames: [
      'DOUYINPAY_PLATFORM_PUBLIC_KEY',
      'DOUYIN_PAY_PLATFORM_PUBLIC_KEY',
      'DOUYIN_PAY_PLATFORM_CERT_PEM',
    ],
    fileEnvNames: ['DOUYINPAY_PLATFORM_PUBLIC_KEY_FILE', 'DOUYIN_PAY_PLATFORM_PUBLIC_KEY_FILE'],
    defaultFilePaths: ['~/stack/douyinpay-platform-public.pem'],
  })
  let privateKeyPem = ''
  let platformPublicKeyPem = ''
  try {
    privateKeyPem = normalizePrivateKeyPem(privateKeyMaterial.pem)
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      missing: ['DOUYINPAY_PRIVATE_KEY'],
    }
  }
  platformPublicKeyPem = normalizePublicKeyPem(platformKeyMaterial.pem)
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
  const signature = signWithPrivateKey(cfg.privateKeyPem, message)
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
