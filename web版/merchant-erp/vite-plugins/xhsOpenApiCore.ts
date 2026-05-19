/**
 * 小红书技术服务合作中心 OpenAPI 通用：会话编解码、签名、HTTP 代理。
 * @see https://developer.xhs.com/docs/api
 */
import { createHash } from 'node:crypto'

export type XhsMerchantSession = {
  v: 1
  appKey: string
  appSecret: string
  accessToken: string
  merchantId: string
  /** 未配置 XHS_OPENAPI_BASE_URL 或显式演示绑定时为 true */
  demo?: boolean
}

const SESSION_PREFIX = 'meoo_xhs1.'

export function xhsOpenApiBaseUrl(): string | null {
  const raw = process.env.XHS_OPENAPI_BASE_URL?.trim().replace(/\/+$/, '')
  return raw || null
}

export function xhsConfiguredForLiveApi(): boolean {
  return Boolean(xhsOpenApiBaseUrl())
}

export function xhsPathFromEnv(envKey: string, fallback: string): string {
  const p = process.env[envKey]?.trim()
  if (!p) return fallback.startsWith('/') ? fallback : `/${fallback}`
  return p.startsWith('/') ? p : `/${p}`
}

export function encodeXhsSessionToken(session: XhsMerchantSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  return `${SESSION_PREFIX}${payload}`
}

export function decodeXhsSessionToken(bearer: string): XhsMerchantSession | null {
  const raw = bearer.trim()
  if (!raw) return null

  if (raw.startsWith(SESSION_PREFIX)) {
    try {
      const j = JSON.parse(
        Buffer.from(raw.slice(SESSION_PREFIX.length), 'base64url').toString('utf8'),
      ) as XhsMerchantSession
      if (j?.v === 1 && j.appKey && j.appSecret && j.accessToken && j.merchantId) return j
    } catch {
      return null
    }
    return null
  }

  const appKey = process.env.XHS_APP_KEY?.trim() || process.env.XHS_APP_ID?.trim() || ''
  const appSecret = process.env.XHS_APP_SECRET?.trim() || ''
  if (!appKey || !appSecret) {
    if (raw.startsWith('mock-xhs-')) {
      return {
        v: 1,
        appKey: 'demo',
        appSecret: 'demo',
        accessToken: raw,
        merchantId: 'demo-merchant',
        demo: true,
      }
    }
    return null
  }
  return {
    v: 1,
    appKey,
    appSecret,
    accessToken: raw,
    merchantId: process.env.XHS_DEFAULT_MERCHANT_ID?.trim() || 'default',
    demo: !xhsConfiguredForLiveApi(),
  }
}

/** 小红书开放平台常见 MD5 签名：secret + key1val1key2val2... + secret */
export function xhsMd5Sign(
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

export async function xhsServerFetch(
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

export type XhsSignedCallResult =
  | { ok: true; status: number; json: Record<string, unknown>; raw: string }
  | { ok: false; message: string; status?: number; raw?: string }

/**
 * 向已配置的小红书 OpenAPI 基址发起请求（GET 查询或 POST JSON）。
 * 具体 path 由业务模块从环境变量读取；签名参数与 body 合并后发送。
 */
export async function xhsSignedRequest(
  session: XhsMerchantSession,
  apiPath: string,
  opts: {
    method?: 'GET' | 'POST'
    query?: Record<string, string | number | undefined>
    body?: Record<string, unknown>
    extraSignParams?: Record<string, string | number | undefined>
  },
): Promise<XhsSignedCallResult> {
  const base = xhsOpenApiBaseUrl()
  if (!base) {
    return { ok: false, message: '未配置 XHS_OPENAPI_BASE_URL' }
  }

  const method = opts.method ?? 'POST'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signParams: Record<string, string | number | boolean | undefined | null> = {
    app_id: session.appKey,
    timestamp,
    ...(opts.extraSignParams ?? {}),
  }
  if (session.accessToken) {
    signParams.session = session.accessToken
    signParams.access_token = session.accessToken
  }
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v != null && v !== '') signParams[k] = v
  }
  const sign = xhsMd5Sign(session.appSecret, signParams)

  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const url = new URL(`${base}${path}`)

  if (method === 'GET') {
    for (const [k, v] of Object.entries(signParams)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v))
    }
    url.searchParams.set('sign', sign)
    const dr = await xhsServerFetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const raw = await dr.text()
    let json: Record<string, unknown> = {}
    try {
      json = JSON.parse(raw || '{}') as Record<string, unknown>
    } catch {
      return {
        ok: false,
        message: `小红书接口返回非 JSON（HTTP ${dr.status}）`,
        status: dr.status,
        raw: raw.slice(0, 1500),
      }
    }
    if (!dr.ok) {
      return {
        ok: false,
        message: extractXhsErrorMessage(json) || `HTTP ${dr.status}`,
        status: dr.status,
        raw,
      }
    }
    return { ok: true, status: dr.status, json, raw }
  }

  const payload: Record<string, unknown> = {
    ...signParams,
    sign,
    ...(opts.body ?? {}),
  }
  const dr = await xhsServerFetch(url.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const raw = await dr.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {
      ok: false,
      message: `小红书接口返回非 JSON（HTTP ${dr.status}）`,
      status: dr.status,
      raw: raw.slice(0, 1500),
    }
  }
  if (!dr.ok) {
    return {
      ok: false,
      message: extractXhsErrorMessage(json) || `HTTP ${dr.status}`,
      status: dr.status,
      raw,
    }
  }
  const bizErr = xhsBizError(json)
  if (bizErr) {
    return { ok: false, message: bizErr, status: dr.status, raw }
  }
  return { ok: true, status: dr.status, json, raw }
}

export function extractXhsErrorMessage(j: Record<string, unknown>): string | undefined {
  const candidates = [
    j.message,
    j.msg,
    j.error_msg,
    j.errorMsg,
    (j.error as Record<string, unknown> | undefined)?.message,
    (j.data as Record<string, unknown> | undefined)?.message,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return undefined
}

/** code 为 0 / OP_SUCCESS / success 等视为成功 */
export function xhsBizError(j: Record<string, unknown>): string | undefined {
  const code = j.error_code ?? j.code ?? j.status ?? j.errno
  if (code === 0 || code === '0' || code === 'OP_SUCCESS' || code === 'success') return undefined
  if (j.success === true || j.ok === true) return undefined
  if (code == null && j.data != null) return undefined
  return extractXhsErrorMessage(j) || extractXhsErrorMessage({ message: j.error_msg }) || `小红书业务错误（code=${String(code ?? 'unknown')}）`
}

export function pickArrayFromXhsPayload(
  j: Record<string, unknown>,
  keys: string[],
): unknown[] {
  const data = j.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>
    for (const k of keys) {
      const v = d[k]
      if (Array.isArray(v)) return v
    }
    if (Array.isArray(d.hits)) return d.hits
  }
  for (const k of keys) {
    const v = j[k]
    if (Array.isArray(v)) return v
  }
  if (Array.isArray(data)) return data
  return []
}
