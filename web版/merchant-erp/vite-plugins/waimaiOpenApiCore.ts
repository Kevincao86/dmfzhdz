/**
 * 外卖平台 OpenAPI 通用：淘宝闪购、美团外卖、京东外卖（商家自研）。
 */
import { createHash } from 'node:crypto'

export type WaimaiPlatformKey = 'eleme' | 'meituan_waimai' | 'jd_waimai'

export type WaimaiMerchantSession = {
  v: 1
  platform: WaimaiPlatformKey
  appKey: string
  appSecret: string
  accessToken: string
  merchantId: string
  demo?: boolean
}

const SESSION_PREFIX: Record<WaimaiPlatformKey, string> = {
  eleme: 'meoo_ele1.',
  meituan_waimai: 'meoo_mtw1.',
  jd_waimai: 'meoo_jdw1.',
}

const ENV_BASE: Record<WaimaiPlatformKey, string> = {
  eleme: 'ELEME_OPENAPI_BASE_URL',
  meituan_waimai: 'MEITUAN_WAIMAI_OPENAPI_BASE_URL',
  jd_waimai: 'JD_WAIMAI_OPENAPI_BASE_URL',
}

export function waimaiOpenApiBaseUrl(platform: WaimaiPlatformKey): string | null {
  const raw = process.env[ENV_BASE[platform]]?.trim().replace(/\/+$/, '')
  return raw || null
}

export function waimaiConfiguredForLiveApi(platform: WaimaiPlatformKey): boolean {
  return Boolean(waimaiOpenApiBaseUrl(platform))
}

export function waimaiPathFromEnv(_platform: WaimaiPlatformKey, envKey: string, fallback: string): string {
  const p = process.env[envKey]?.trim()
  if (!p) return fallback.startsWith('/') ? fallback : `/${fallback}`
  return p.startsWith('/') ? p : `/${p}`
}

export function encodeWaimaiSessionToken(session: WaimaiMerchantSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  return `${SESSION_PREFIX[session.platform]}${payload}`
}

export function decodeWaimaiSessionToken(
  platform: WaimaiPlatformKey,
  bearer: string,
): WaimaiMerchantSession | null {
  const raw = bearer.trim()
  const prefix = SESSION_PREFIX[platform]
  if (!raw.startsWith(prefix)) return null
  try {
    const j = JSON.parse(Buffer.from(raw.slice(prefix.length), 'base64url').toString('utf8')) as WaimaiMerchantSession
    if (j?.v === 1 && j.platform === platform && j.appKey && j.appSecret && j.accessToken && j.merchantId) {
      return j
    }
  } catch {
    return null
  }
  return null
}

export function waimaiMd5Sign(
  appSecret: string,
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] != null && params[k] !== '')
    .sort()
  let s = appSecret
  for (const k of keys) {
    s += k + String(params[k])
  }
  s += appSecret
  return createHash('md5').update(s, 'utf8').digest('hex').toUpperCase()
}

export async function waimaiServerFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 25_000
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const { timeoutMs: _omit, ...rest } = init
    return await fetch(url, { ...rest, signal: ac.signal })
  } finally {
    clearTimeout(t)
  }
}

export type WaimaiSignedCallResult =
  | { ok: true; status: number; json: Record<string, unknown>; raw: string }
  | { ok: false; message: string; status?: number; raw?: string }

export async function waimaiSignedRequest(
  session: WaimaiMerchantSession,
  path: string,
  input: {
    method?: 'GET' | 'POST'
    body?: Record<string, unknown>
    extraSignParams?: Record<string, string | number | boolean | undefined>
  },
): Promise<WaimaiSignedCallResult> {
  const base = waimaiOpenApiBaseUrl(session.platform)
  if (!base) {
    return { ok: false, message: `未配置 ${ENV_BASE[session.platform]}` }
  }
  const method = input.method ?? 'POST'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const params: Record<string, string | number | boolean | undefined> = {
    app_id: session.appKey,
    timestamp,
    ...input.extraSignParams,
  }
  if (session.accessToken) params.access_token = session.accessToken
  if (input.body) {
    for (const [k, v] of Object.entries(input.body)) {
      if (v != null) params[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
    }
  }
  params.sign = waimaiMd5Sign(session.appSecret, params)

  const url = new URL(path.startsWith('/') ? path : `/${path}`, base)
  let res: Response
  try {
    if (method === 'GET') {
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== '') url.searchParams.set(k, String(v))
      }
      res = await waimaiServerFetch(url.toString(), { method: 'GET' })
    } else {
      res = await waimaiServerFetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ ...input.body, ...params }),
      })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg }
  }

  const raw = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { ok: false, message: '响应非 JSON', status: res.status, raw }
  }
  const code = json.code ?? json.status ?? json.errno
  if (!res.ok || (code != null && String(code) !== '0' && code !== 200 && code !== 'OK')) {
    const msg =
      (typeof json.message === 'string' && json.message) ||
      (typeof json.msg === 'string' && json.msg) ||
      `HTTP ${res.status}`
    return { ok: false, message: msg, status: res.status, raw }
  }
  return { ok: true, status: res.status, json, raw }
}

export function pickArrayFromWaimaiPayload(
  json: Record<string, unknown>,
  keys: string[],
): unknown[] {
  for (const k of keys) {
    const v = json[k]
    if (Array.isArray(v)) return v
    const data = json.data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const nested = (data as Record<string, unknown>)[k]
      if (Array.isArray(nested)) return nested
    }
  }
  if (Array.isArray(json.data)) return json.data as unknown[]
  return []
}
