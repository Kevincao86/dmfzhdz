/**
 * 支付宝 OpenAPI
 * - 电脑网站支付：alipay.trade.page.pay + FAST_INSTANT_TRADE_PAY（默认，与 open.alipay.com 签约一致）
 * - 当面付扫码：alipay.trade.precreate + FACE_TO_FACE_PAYMENT（需单独签约当面付）
 * 文档：https://opendocs.alipay.com/open/028r8t · https://opendocs.alipay.com/open/02ekfg
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
  returnUrl: string
  /** page=电脑网站支付；precreate=当面付扫码 */
  payProduct: 'page' | 'precreate'
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
  const returnUrl =
    String(process.env.ALIPAY_RETURN_URL || '').trim() ||
    'https://dr.mofangdianai.com/profile/membership'
  const payProductRaw = String(process.env.ALIPAY_PAY_PRODUCT || 'page').trim().toLowerCase()
  const payProduct: 'page' | 'precreate' =
    payProductRaw === 'precreate' || payProductRaw === 'face_to_face' ? 'precreate' : 'page'

  if (!appId) missing.push('ALIPAY_APP_ID')
  if (!privateKeyPem) missing.push('ALIPAY_PRIVATE_KEY')
  if (!alipayPublicKeyPem) missing.push('ALIPAY_PUBLIC_KEY')

  if (missing.length) return { ok: false, error: 'alipay_not_configured', missing }
  return {
    ok: true,
    config: { appId, privateKeyPem, alipayPublicKeyPem, notifyUrl, returnUrl, payProduct },
  }
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
  opts?: { notifyUrl?: boolean; returnUrl?: boolean },
): Promise<Record<string, unknown>> {
  const params: Record<string, string> = {
    app_id: cfg.appId,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: formatAlipayTimestamp(),
    version: '1.0',
    biz_content: JSON.stringify(bizContent),
  }
  if (opts?.notifyUrl !== false) params.notify_url = cfg.notifyUrl
  if (opts?.returnUrl) params.return_url = cfg.returnUrl
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

function buildSignedGatewayQuery(
  cfg: AlipayPayConfig,
  method: string,
  bizContent: Record<string, unknown>,
  opts?: { notifyUrl?: boolean; returnUrl?: boolean },
): string {
  const params: Record<string, string> = {
    app_id: cfg.appId,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: formatAlipayTimestamp(),
    version: '1.0',
    biz_content: JSON.stringify(bizContent),
  }
  if (opts?.notifyUrl !== false) params.notify_url = cfg.notifyUrl
  if (opts?.returnUrl) params.return_url = cfg.returnUrl
  params.sign = signAlipayParams(params, cfg.privateKeyPem)
  return `https://openapi.alipay.com/gateway.do?${new URLSearchParams(params).toString()}`
}

/** 电脑网站支付：在商户页 iframe 嵌入支付宝订单码（qr_pay_mode=4） */
export function buildAlipayPagePayUrl(opts: {
  cfg: AlipayPayConfig
  outTradeNo: string
  description: string
  amountCents: number
  attach?: string
  qrPayMode?: '0' | '1' | '2' | '3' | '4'
  qrcodeWidth?: number
}): string {
  const totalAmount = (opts.amountCents / 100).toFixed(2)
  const bizContent: Record<string, unknown> = {
    out_trade_no: opts.outTradeNo,
    total_amount: totalAmount,
    subject: opts.description.slice(0, 127),
    product_code: 'FAST_INSTANT_TRADE_PAY',
    integration_type: 'PCWEB',
    qr_pay_mode: opts.qrPayMode ?? '4',
    qrcode_width: opts.qrcodeWidth ?? 220,
  }
  if (opts.attach) bizContent.body = opts.attach.slice(0, 128)
  return buildSignedGatewayQuery(opts.cfg, 'alipay.trade.page.pay', bizContent, {
    notifyUrl: true,
    returnUrl: true,
  })
}

function decodeLooseHtmlText(raw: string): string {
  return String(raw || '')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/** 从 page.pay 收银页 HTML 解析可扫码链接（供本地 QR 渲染，与微信/抖音一致） */
export async function fetchAlipayPagePayQrCode(payPageUrl: string): Promise<string> {
  const res = await fetch(payPageUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  const html = await res.text()
  if (!html.trim()) throw new Error('alipay_page_empty')

  const patterns: RegExp[] = [
    /https:\/\/qr\.alipay\.com\/[^\s"'<>\\]+/,
    /https:\/\/mclient\.alipay\.com\/[^\s"'<>\\]+/,
    /alipays:\/\/platformapi\/[^\s"'<>\\]+/,
    /"(https:\/\/[^"]*(?:qr|cashier|mclient)[^"]*)"/i,
    new RegExp("'([^']*(?:qr\\.alipay|mclient\\.alipay|alipays://)[^']*)'", 'i'),
    /"qr(?:_)?code"\s*:\s*"([^"]+)"/i,
    /'qr(?:_)?code'\s*:\s*'([^']+)'/i,
    /data:image\/png;base64,[A-Za-z0-9+/=]+/,
  ]

  for (const pattern of patterns) {
    const m = html.match(pattern)
    if (!m) continue
    const hit = decodeLooseHtmlText(m[1] || m[0])
    if (hit.startsWith('http') || hit.startsWith('alipays://') || hit.startsWith('data:image/')) {
      return hit
    }
  }

  throw new Error('alipay_page_qr_not_found')
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

/** 按签约产品下单：默认电脑网站支付 page.pay，当面付需 ALIPAY_PAY_PRODUCT=precreate */
export async function createAlipayMembershipPayOrder(opts: {
  cfg: AlipayPayConfig
  outTradeNo: string
  description: string
  amountCents: number
  attach?: string
}): Promise<{ payMode: 'alipay_page' | 'alipay_precreate'; qrCode?: string; payPageUrl?: string }> {
  if (opts.cfg.payProduct === 'precreate') {
    const { qrCode } = await createAlipayPrecreateOrder(opts)
    return { payMode: 'alipay_precreate', qrCode }
  }
  const payPageUrl = buildAlipayPagePayUrl(opts)
  try {
    const qrCode = await fetchAlipayPagePayQrCode(payPageUrl)
    return { payMode: 'alipay_page', qrCode, payPageUrl }
  } catch {
    return { payMode: 'alipay_page', payPageUrl }
  }
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
