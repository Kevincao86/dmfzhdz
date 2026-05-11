/**
 * POST /api/douyin-bind — 抖音来客绑定（单文件入口）
 *
 * 完整实现写在本文件内，避免 Vercel Serverless 分包遗漏 `./merchant/douyin/bindRuntime`。
 * `meoo-douyin-bind` / `merchant/douyin/bind` 仅 re-export 本文件 default。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

export type DouyinMerchantSession = {
  clientKey: string
  clientSecret: string
  merchantId: string
  douyinToken: string
  douyinExpiresAtMs: number
}

export const douyinMerchantDevSessions = new Map<string, DouyinMerchantSession>()

const PREFIX = 'moo1.'
const ALGO = 'aes-256-gcm'

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'meoo-douyin-session', 32)
}

export type DouyinSessionCredentialsPayload = {
  clientKey: string
  clientSecret: string
  merchantId: string
}

export function sealDouyinSessionCredentials(
  payload: DouyinSessionCredentialsPayload,
  secret: string,
): string {
  const key = deriveKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const enc = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  const blob = Buffer.concat([iv, tag, enc]).toString('base64url')
  return `${PREFIX}${blob}`
}

export function openDouyinSessionCredentials(token: string): DouyinSessionCredentialsPayload | null {
  if (!token.startsWith(PREFIX)) return null
  const secret = process.env.MERCHANT_DOUYIN_SESSION_SECRET?.trim()
  if (!secret) return null
  try {
    const key = deriveKey(secret)
    const buf = Buffer.from(token.slice(PREFIX.length), 'base64url')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(enc), decipher.final()])
    const j = JSON.parse(plain.toString('utf8')) as DouyinSessionCredentialsPayload
    if (
      typeof j.clientKey !== 'string' ||
      typeof j.clientSecret !== 'string' ||
      typeof j.merchantId !== 'string'
    ) {
      return null
    }
    return j
  } catch {
    return null
  }
}

export function merchantDouyinSessionSecret(): string {
  return process.env.MERCHANT_DOUYIN_SESSION_SECRET?.trim() ?? ''
}

const DOUYIN_CLIENT_TOKEN_URL = 'https://open.douyin.com/oauth/client_token/'
const DOUYIN_SHOP_POI_QUERY = 'https://open.douyin.com/goodlife/v1/shop/poi/query/'
const DOUYIN_FETCH_TIMEOUT_MS = 25_000

function fetchTimeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

function douyinFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: fetchTimeoutSignal(DOUYIN_FETCH_TIMEOUT_MS),
  })
}

function parseDouyinEnvelope(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function numericErrorCode(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function getDataError(j: Record<string, unknown>): { ok: boolean; msg?: string } {
  const rootCode = numericErrorCode(j.error_code)
  if (rootCode !== undefined && rootCode !== 0) {
    return { ok: false, msg: String(j.description ?? j.msg ?? `抖音根 error_code=${rootCode}`) }
  }
  const data = j.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const code = numericErrorCode(d.error_code)
    if (code !== undefined && code !== 0) {
      return { ok: false, msg: String(d.description ?? `抖音 error_code=${code}`) }
    }
  }
  const extra = j.extra
  if (extra && typeof extra === 'object') {
    const e = extra as Record<string, unknown>
    const code = numericErrorCode(e.error_code)
    if (code !== undefined && code !== 0) {
      return { ok: false, msg: String(e.description ?? `抖音 extra error_code=${code}`) }
    }
  }
  return { ok: true }
}

function extractPoisFromShopQueryData(data: Record<string, unknown> | undefined): unknown[] {
  if (!data || typeof data !== 'object') return []
  const direct = data.pois
  if (Array.isArray(direct)) return direct
  const alt = data.list ?? data.poi_list ?? data.shop_list ?? data.shops ?? data.records
  if (Array.isArray(alt)) return alt
  return []
}

async function fetchDouyinClientToken(
  clientKey: string,
  clientSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  const res = await douyinFetch(DOUYIN_CLIENT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'client_credential',
    }),
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`client_token HTTP ${res.status}：${raw.slice(0, 300)}`)
  }
  const j = parseDouyinEnvelope(raw)
  const err = getDataError(j)
  if (!err.ok) {
    throw new Error(err.msg ?? `client_token 业务错误`)
  }
  const data = j.data as Record<string, unknown> | undefined
  const token = String(data?.access_token ?? j.access_token ?? '')
  if (!token) throw new Error('client_token 响应缺少 access_token')
  const expiresIn = Number(data?.expires_in ?? 7200)
  return { token, expiresIn }
}

async function ensureDouyinToken(s: DouyinMerchantSession): Promise<string> {
  const skew = 120_000
  if (s.douyinToken && Date.now() < s.douyinExpiresAtMs - skew) {
    return s.douyinToken
  }
  const { token, expiresIn } = await fetchDouyinClientToken(s.clientKey, s.clientSecret)
  s.douyinToken = token
  s.douyinExpiresAtMs = Date.now() + Math.max(300, expiresIn) * 1000
  return token
}

async function shopPoiQueryPage(
  accountId: string,
  accessToken: string,
  page: number,
  size: number,
): Promise<Record<string, unknown>> {
  const u = new URL(DOUYIN_SHOP_POI_QUERY)
  u.searchParams.set('account_id', accountId)
  u.searchParams.set('page', String(Math.max(1, page)))
  u.searchParams.set('size', String(Math.min(50, Math.max(1, size))))

  const res = await douyinFetch(u.toString(), {
    method: 'GET',
    headers: {
      'access-token': accessToken,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`shop/query HTTP ${res.status}：${raw.slice(0, 400)}`)
  }
  const j = parseDouyinEnvelope(raw)
  const err = getDataError(j)
  if (!err.ok) throw new Error(err.msg ?? 'shop/query 业务错误')
  return j
}

function accountNameFromPois(pois: unknown[]): string | undefined {
  for (const row of pois) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const acc =
      o.account && typeof o.account === 'object'
        ? (o.account as Record<string, unknown>)
        : null
    const root =
      acc?.root_account && typeof acc.root_account === 'object'
        ? (acc.root_account as Record<string, unknown>)
        : null
    const n = root?.account_name
    if (typeof n === 'string' && n.trim()) return n.trim()
    const r2 =
      o.root_account && typeof o.root_account === 'object'
        ? (o.root_account as Record<string, unknown>)
        : null
    const n2 = r2?.account_name
    if (typeof n2 === 'string' && n2.trim()) return n2.trim()
  }
  return undefined
}

export async function runDouyinMerchantBind(
  bodyRaw: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  let body: { appId?: string; appSecret?: string; merchantId?: string }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { statusCode: 400, body: { message: '请求体须为 JSON' } }
  }
  const clientKey = String(body.appId ?? '').trim()
  const clientSecret = String(body.appSecret ?? '').trim()
  const merchantId = String(body.merchantId ?? '').trim()
  if (!clientKey || !clientSecret || !merchantId) {
    return {
      statusCode: 400,
      body: { message: '请提供 appId（client_key）、appSecret（client_secret）、merchantId（account_id）' },
    }
  }

  try {
    const session: DouyinMerchantSession = {
      clientKey,
      clientSecret,
      merchantId,
      douyinToken: '',
      douyinExpiresAtMs: 0,
    }
    const token = await ensureDouyinToken(session)
    const first = await shopPoiQueryPage(merchantId, token, 1, 1)
    const d = first.data as Record<string, unknown> | undefined
    const pois = extractPoisFromShopQueryData(d)
    const accountName = accountNameFromPois(pois)

    const secret = merchantDouyinSessionSecret()
    let accessToken: string
    if (secret) {
      accessToken = sealDouyinSessionCredentials({ clientKey, clientSecret, merchantId }, secret)
    } else {
      const sid = randomBytes(32).toString('hex')
      douyinMerchantDevSessions.set(sid, session)
      accessToken = sid
    }

    return {
      statusCode: 200,
      body: {
        accessToken,
        accountName: accountName ?? undefined,
        message: secret
          ? '已绑定抖音来客（线上加密会话，请在部署环境配置 MERCHANT_DOUYIN_SESSION_SECRET）。'
          : '已建立直连抖音开放平台的本地会话（仅开发服务器内存）。',
      },
    }
  } catch (e) {
    const aborted =
      e instanceof Error && (e.name === 'AbortError' || /aborted|timeout/i.test(e.message))
    const detail = aborted
      ? `连接抖音开放平台超时（${Math.round(DOUYIN_FETCH_TIMEOUT_MS / 1000)}s）。请稍后重试；若持续失败，可在 Vercel → Functions → 区域改为东京(hnd1)/首尔(icn1)等离大陆更近的节点后再试。`
      : e instanceof Error
        ? e.message
        : String(e)
    return { statusCode: 502, body: { message: `抖音鉴权或门店查询失败：${detail}` } }
  }
}

export const config = { maxDuration: 60 }

function sendSafeJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  try {
    if (res.writableEnded) return
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).send(JSON.stringify(body))
  } catch {
    try {
      if (!res.writableEnded) res.end()
    } catch {
      /* noop */
    }
  }
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return '{}'
  } catch {
    return '{}'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.status(204).end()
      return
    }

    if (req.method !== 'POST') {
      sendSafeJson(res, 405, { message: 'Method Not Allowed' })
      return
    }

    const r = await runDouyinMerchantBind(rawBody(req))
    let payload: string
    try {
      payload = JSON.stringify(r.body)
    } catch {
      payload = JSON.stringify({ message: '绑定结果无法序列化为 JSON' })
    }
    if (!res.writableEnded) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.status(r.statusCode).send(payload)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendSafeJson(res, 500, {
      message: msg || '抖音绑定处理异常',
      hint: '请确认 Vercel Root Directory 为 web版/merchant-erp，并已部署含本文件的最新构建。',
    })
  }
}
