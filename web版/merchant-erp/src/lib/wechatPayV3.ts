/** 微信支付 API v3（Native / JSAPI + 回调验签解密） */
import { createDecipheriv, createSign, createVerify, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type WechatPayConfig = {
  mchId: string
  appId: string
  apiV3Key: string
  merchantSerial: string
  privateKeyPem: string
  platformPublicKeyPem: string
  notifyUrl: string
}

export type WechatPayConfigResult =
  | { ok: true; config: WechatPayConfig }
  | { ok: false; error: string; missing: string[] }

function expandHome(p: string): string {
  const t = String(p || '').trim()
  if (!t) return ''
  if (t.startsWith('~/')) return path.join(os.homedir(), t.slice(2))
  return t
}

function readPemEnv(name: string): string {
  const raw = String(process.env[name] || '').trim()
  if (!raw) return ''
  if (raw.includes('-----BEGIN')) return raw.replace(/\\n/g, '\n')
  return ''
}

function readPemFile(filePath: string): string {
  const fp = expandHome(filePath)
  if (!fp || !fs.existsSync(fp)) return ''
  try {
    return fs.readFileSync(fp, 'utf8').replace(/\\n/g, '\n').trim()
  } catch {
    return ''
  }
}

function readPemMaterial(opts: {
  inlineEnvNames: string[]
  fileEnvNames: string[]
  defaultFilePaths: string[]
}): string {
  for (const name of opts.fileEnvNames) {
    const fp = expandHome(String(process.env[name] || '').trim())
    if (!fp) continue
    const pem = readPemFile(fp)
    if (pem) return pem
  }
  for (const fp of opts.defaultFilePaths) {
    const pem = readPemFile(fp)
    if (pem) return pem
  }
  for (const name of opts.inlineEnvNames) {
    const pem = readPemEnv(name)
    if (pem) return pem
  }
  return ''
}

export function loadWechatPayConfig(): WechatPayConfigResult {
  const missing: string[] = []
  const mchId = String(process.env.WECHAT_PAY_MCH_ID || '').trim()
  const appId = String(
    process.env.WECHAT_PAY_APP_ID ||
      process.env.ERP_MP_WECHAT_APPID ||
      process.env.MERCHANT_MP_WECHAT_APPID ||
      process.env.MP_WECHAT_APPID ||
      process.env.WX_APPID ||
      '',
  ).trim()
  const apiV3Key = String(process.env.WECHAT_PAY_API_V3_KEY || '').trim()
  const merchantSerial = String(process.env.WECHAT_PAY_MERCHANT_SERIAL || '').trim()
  const privateKeyPem = readPemMaterial({
    inlineEnvNames: ['WECHAT_PAY_PRIVATE_KEY', 'WECHAT_PAY_PRIVATE_KEY_PEM'],
    fileEnvNames: ['WECHAT_PAY_PRIVATE_KEY_FILE'],
    defaultFilePaths: ['~/stack/wechat-private.pem'],
  })
  const platformPublicKeyPem = readPemMaterial({
    inlineEnvNames: ['WECHAT_PAY_PLATFORM_PUBLIC_KEY', 'WECHAT_PAY_PLATFORM_CERT_PEM'],
    fileEnvNames: ['WECHAT_PAY_PLATFORM_PUBLIC_KEY_FILE'],
    defaultFilePaths: ['~/stack/wechat-platform-public.pem'],
  })
  const notifyUrl =
    String(process.env.WECHAT_PAY_NOTIFY_URL || '').trim() ||
    'https://mofangdianai.com/erp-api/meoo-wechat-pay-notify'

  if (!mchId) missing.push('WECHAT_PAY_MCH_ID')
  if (!appId) missing.push('WECHAT_PAY_APP_ID')
  if (!apiV3Key) missing.push('WECHAT_PAY_API_V3_KEY')
  if (!merchantSerial) missing.push('WECHAT_PAY_MERCHANT_SERIAL')
  if (!privateKeyPem) missing.push('WECHAT_PAY_PRIVATE_KEY')
  if (!platformPublicKeyPem) missing.push('WECHAT_PAY_PLATFORM_PUBLIC_KEY')

  if (missing.length) return { ok: false, error: 'wechat_pay_not_configured', missing }
  return {
    ok: true,
    config: {
      mchId,
      appId,
      apiV3Key,
      merchantSerial,
      privateKeyPem,
      platformPublicKeyPem,
      notifyUrl,
    },
  }
}

function nonceStr(): string {
  return randomBytes(16).toString('hex')
}

function signRequest(
  cfg: WechatPayConfig,
  method: string,
  urlPath: string,
  body: string,
): { authorization: string; timestamp: string; nonce: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = nonceStr()
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`
  const signature = createSign('RSA-SHA256').update(message).sign(cfg.privateKeyPem, 'base64')
  const authorization =
    `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchId}",` +
    `nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.merchantSerial}"`
  return { authorization, timestamp, nonce }
}

async function wechatPayFetch<T>(
  cfg: WechatPayConfig,
  method: 'GET' | 'POST',
  urlPath: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const body = payload ? JSON.stringify(payload) : ''
  const { authorization } = signRequest(cfg, method, urlPath, body)
  const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method,
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'meoo-auth-api/wechat-pay-v3',
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
  if (!res.ok) {
    const err = data as Record<string, unknown>
    throw new Error(String(err.message || err.code || `wechat_http_${res.status}`))
  }
  return data as T
}

export async function createWechatNativeOrder(opts: {
  cfg: WechatPayConfig
  outTradeNo: string
  description: string
  amountCents: number
  attach?: string
}): Promise<{ codeUrl: string; prepayId?: string }> {
  const { cfg, outTradeNo, description, amountCents, attach } = opts
  const data = await wechatPayFetch<{ code_url?: string; prepay_id?: string }>(
    cfg,
    'POST',
    '/v3/pay/transactions/native',
    {
      appid: cfg.appId,
      mchid: cfg.mchId,
      description: description.slice(0, 127),
      out_trade_no: outTradeNo,
      notify_url: cfg.notifyUrl,
      amount: { total: amountCents, currency: 'CNY' },
      ...(attach ? { attach: attach.slice(0, 128) } : {}),
    },
  )
  const codeUrl = String(data.code_url || '').trim()
  if (!codeUrl) throw new Error('missing_code_url')
  return { codeUrl, prepayId: data.prepay_id }
}

export async function createWechatJsapiOrder(opts: {
  cfg: WechatPayConfig
  outTradeNo: string
  description: string
  amountCents: number
  openid: string
  attach?: string
}): Promise<{ prepayId: string }> {
  const { cfg, outTradeNo, description, amountCents, openid, attach } = opts
  const data = await wechatPayFetch<{ prepay_id?: string }>(
    cfg,
    'POST',
    '/v3/pay/transactions/jsapi',
    {
      appid: cfg.appId,
      mchid: cfg.mchId,
      description: description.slice(0, 127),
      out_trade_no: outTradeNo,
      notify_url: cfg.notifyUrl,
      amount: { total: amountCents, currency: 'CNY' },
      payer: { openid },
      ...(attach ? { attach: attach.slice(0, 128) } : {}),
    },
  )
  const prepayId = String(data.prepay_id || '').trim()
  if (!prepayId) throw new Error('missing_prepay_id')
  return { prepayId }
}

/** 前端 wx.chooseWXPay 所需参数 */
export function buildJsapiPayParams(cfg: WechatPayConfig, prepayId: string) {
  const timeStamp = Math.floor(Date.now() / 1000).toString()
  const nonceStrVal = nonceStr()
  const pkg = `prepay_id=${prepayId}`
  const message = `${cfg.appId}\n${timeStamp}\n${nonceStrVal}\n${pkg}\n`
  const paySign = createSign('RSA-SHA256').update(message).sign(cfg.privateKeyPem, 'base64')
  return {
    appId: cfg.appId,
    timeStamp,
    nonceStr: nonceStrVal,
    package: pkg,
    signType: 'RSA' as const,
    paySign,
  }
}

export function verifyWechatPayNotifySignature(opts: {
  cfg: WechatPayConfig
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

export function decryptWechatPayResource(
  apiV3Key: string,
  resource: { ciphertext: string; nonce: string; associated_data?: string },
): Record<string, unknown> {
  const key = Buffer.from(apiV3Key, 'utf8')
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

export async function queryWechatOrderByOutTradeNo(
  cfg: WechatPayConfig,
  outTradeNo: string,
): Promise<{ tradeState: string; transactionId?: string }> {
  const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(cfg.mchId)}`
  const data = await wechatPayFetch<{ trade_state?: string; transaction_id?: string }>(
    cfg,
    'GET',
    urlPath,
  )
  return {
    tradeState: String(data.trade_state || ''),
    transactionId: data.transaction_id ? String(data.transaction_id) : undefined,
  }
}
