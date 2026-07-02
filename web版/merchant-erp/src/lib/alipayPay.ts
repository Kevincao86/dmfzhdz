/**
 * 支付宝 OpenAPI — 当面付 precreate（扫码）+ 订单查询 + 回调验签
 * 文档：https://opendocs.alipay.com/open/02ekfg
 */
import { createPrivateKey, createSign, createVerify, type KeyObject } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type AlipayPayConfig = {
  appId: string
  privateKeyPem: string
  alipayPublicKeyPem: string
  notifyUrl: string
}

export type AlipayPayConfigResult =
  | { ok: true; config: AlipayPayConfig }
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
    if (isValidPemMaterial(pem)) return { pem, source: `file:${name}` }
  }
  for (const fp of opts.defaultFilePaths) {
    const pem = readPemFile(fp)
    if (isValidPemMaterial(pem)) return { pem, source: `file:${fp}` }
  }
  for (const name of opts.inlineEnvNames) {
    const pem = readPemEnv(name)
    if (isValidPemMaterial(pem)) return { pem, source: `env:${name}` }
  }
  return { pem: '', source: '' }
}

function isValidPemMaterial(pem: string): boolean {
  const t = unescapePemText(pem)
  if (!t) return false
  if (!t.includes('BEGIN')) return false
  const body = t.replace(/-----BEGIN[^-]+-----/g, '').replace(/-----END[^-]+-----/g, '').replace(/\s+/g, '')
  return body.length > 32
}

function normalizePrivateKeyPem(pem: string): string {
  const t = unescapePemText(pem)
  if (!t || !isValidPemMaterial(t)) return ''
  if (t.includes('BEGIN RSA PRIVATE KEY') || t.includes('BEGIN PRIVATE KEY')) return t
  const body = t.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join('\n')}\n-----END RSA PRIVATE KEY-----`
}

function normalizePublicKeyPem(pem: string): string {
  const t = unescapePemText(pem)
  if (!t || !isValidPemMaterial(t)) return ''
  if (t.includes('BEGIN PUBLIC KEY')) return t
  const body = t.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) || [body]
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

function loadPrivateKeyObject(privateKeyPem: string): KeyObject {
  const pem = normalizePrivateKeyPem(privateKeyPem)
  if (!pem) throw new Error('alipay_private_key_missing')
  try {
    return createPrivateKey(pem)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`alipay_private_key_invalid: ${msg}`)
  }
}

export function describeAlipayPayKeySources(): {
  privateKeySource: string
  publicKeySource: string
} {
  const priv = readPemMaterial({
    inlineEnvNames: ['ALIPAY_PRIVATE_KEY', 'ALIPAY_PRIVATE_KEY_PEM', 'ALIPAY_APP_PRIVATE_KEY'],
    fileEnvNames: ['ALIPAY_PRIVATE_KEY_FILE'],
    defaultFilePaths: ['~/stack/alipay-app-private.pem'],
  })
  const pub = readPemMaterial({
    inlineEnvNames: ['ALIPAY_PUBLIC_KEY', 'ALIPAY_PUBLIC_KEY_PEM', 'ALIPAY_PLATFORM_PUBLIC_KEY'],
    fileEnvNames: ['ALIPAY_PUBLIC_KEY_FILE'],
    defaultFilePaths: ['~/stack/alipay-platform-public.pem'],
  })
  return { privateKeySource: priv.source, publicKeySource: pub.source }
}

export function testAlipayPrivateKeySign(
  cfg: AlipayPayConfig,
): { ok: true } | { ok: false; error: string } {
  try {
    const key = loadPrivateKeyObject(cfg.privateKeyPem)
    createSign('RSA-SHA256').update('meoo-alipay-sign-probe').sign(key, 'base64')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function loadAlipayPayConfig(): AlipayPayConfigResult {
  const missing: string[] = []
  const appId = String(process.env.ALIPAY_APP_ID || process.env.ALIPAY_APPID || '').trim()
  const privateKeyMaterial = readPemMaterial({
    inlineEnvNames: ['ALIPAY_PRIVATE_KEY', 'ALIPAY_PRIVATE_KEY_PEM', 'ALIPAY_APP_PRIVATE_KEY'],
    fileEnvNames: ['ALIPAY_PRIVATE_KEY_FILE'],
    defaultFilePaths: ['~/stack/alipay-app-private.pem'],
  })
  const publicKeyMaterial = readPemMaterial({
    inlineEnvNames: ['ALIPAY_PUBLIC_KEY', 'ALIPAY_PUBLIC_KEY_PEM', 'ALIPAY_PLATFORM_PUBLIC_KEY'],
    fileEnvNames: ['ALIPAY_PUBLIC_KEY_FILE'],
    defaultFilePaths: ['~/stack/alipay-platform-public.pem'],
  })
  const privateKeyPem = normalizePrivateKeyPem(privateKeyMaterial.pem)
  const alipayPublicKeyPem = normalizePublicKeyPem(publicKeyMaterial.pem)
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
  const key = loadPrivateKeyObject(privateKeyPem)
  return createSign('RSA-SHA256').update(str, 'utf8').sign(key, 'base64')
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
