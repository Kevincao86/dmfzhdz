/**
 * 美团技术服务合作中心 OpenAPI 通用：会话编解码、签名、HTTP 代理。
 * 当前 ERP 绑定按「商家自研」：商户自建应用密钥 + 可选 appAuthToken，非三方服务商代授权。
 * @see https://developer.meituan.com/docs/api
 */
import { createHash } from 'node:crypto'

export type MeituanMerchantSession = {
  v: 1
  appKey: string
  appSecret: string
  accessToken: string
  merchantId: string
  /** 未配置 MEITUAN_OPENAPI_BASE_URL 或显式演示绑定时为 true */
  demo?: boolean
}

const SESSION_PREFIX = 'meoo_mt1.'

export function meituanOpenApiBaseUrl(): string | null {
  const raw = process.env.MEITUAN_OPENAPI_BASE_URL?.trim().replace(/\/+$/, '')
  return raw || null
}

export function meituanConfiguredForLiveApi(): boolean {
  return Boolean(meituanOpenApiBaseUrl())
}

export function meituanPathFromEnv(envKey: string, fallback: string): string {
  const p = process.env[envKey]?.trim()
  if (!p) return fallback.startsWith('/') ? fallback : `/${fallback}`
  return p.startsWith('/') ? p : `/${p}`
}

export function encodeMeituanSessionToken(session: MeituanMerchantSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  return `${SESSION_PREFIX}${payload}`
}

export function decodeMeituanSessionToken(bearer: string): MeituanMerchantSession | null {
  const raw = bearer.trim()
  if (!raw) return null

  if (raw.startsWith(SESSION_PREFIX)) {
    try {
      const j = JSON.parse(
        Buffer.from(raw.slice(SESSION_PREFIX.length), 'base64url').toString('utf8'),
      ) as MeituanMerchantSession
      if (j?.v === 1 && j.appKey && j.appSecret && j.accessToken && j.merchantId) return j
    } catch {
      return null
    }
    return null
  }

  const appKey = process.env.MEITUAN_APP_KEY?.trim() || process.env.MEITUAN_APP_ID?.trim() || ''
  const appSecret = process.env.MEITUAN_APP_SECRET?.trim() || ''
  if (!appKey || !appSecret) {
    if (raw.startsWith('mock-meituan-')) {
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
    merchantId: process.env.MEITUAN_DEFAULT_MERCHANT_ID?.trim() || 'default',
    demo: !meituanConfiguredForLiveApi(),
  }
}

/**
 * 美团技术服务合作中心签名：SignKey + 按参数名升序的 key+value，SHA1 小写。
 * @see https://developer.meituan.com/docs/biz/comm-dev-isv-api-rule
 */
export function meituanSha1Sign(signKey: string, params: Record<string, string>): string {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== '')
    .sort()
  let s = signKey
  for (const k of keys) s += k + params[k]
  return createHash('sha1').update(s, 'utf8').digest('hex')
}

/** 团购业务 ID。文档示例：团购 1，外卖 2。可用 MEITUAN_BUSINESS_ID 覆盖。 */
export function meituanGroupbuyBusinessId(): string {
  const raw = process.env.MEITUAN_BUSINESS_ID?.trim()
  return raw || '1'
}

export async function meituanServerFetch(
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

export type MeituanSignedCallResult =
  | { ok: true; status: number; json: Record<string, unknown>; raw: string }
  | { ok: false; message: string; status?: number; raw?: string }

function meituanBizPayload(
  session: MeituanMerchantSession,
  opts: {
    query?: Record<string, string | number | undefined>
    body?: Record<string, unknown>
  },
): Record<string, string> {
  const biz: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v != null && v !== '') biz[k] = v
  }
  for (const [k, v] of Object.entries(opts.body ?? {})) {
    if (v != null && v !== '') biz[k] = v
  }
  const timestamp = String(Math.floor(Date.now() / 1000))
  const params: Record<string, string> = {
    developerId: session.appKey,
    charset: 'utf-8',
    timestamp,
    version: '2',
    businessId: meituanGroupbuyBusinessId(),
    biz: JSON.stringify(biz),
  }
  if (session.accessToken) params.appAuthToken = session.accessToken
  params.sign = meituanSha1Sign(session.appSecret, params)
  return params
}

async function readMeituanHttpResult(dr: Response): Promise<MeituanSignedCallResult> {
  const raw = await dr.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {
      ok: false,
      message: `美团接口返回非 JSON（HTTP ${dr.status}）`,
      status: dr.status,
      raw: raw.slice(0, 1500),
    }
  }
  if (!dr.ok) {
    return {
      ok: false,
      message: extractMeituanErrorMessage(json) || `HTTP ${dr.status}`,
      status: dr.status,
      raw,
    }
  }
  const bizErr = meituanBizError(json)
  if (bizErr) return { ok: false, message: bizErr, status: dr.status, raw }
  return { ok: true, status: dr.status, json, raw }
}

/**
 * 按美团技术服务合作中心公共参数调用（developerId / businessId / biz / appAuthToken）。
 * 具体 path 由业务模块从环境变量读取。
 */
export async function meituanSignedRequest(
  session: MeituanMerchantSession,
  apiPath: string,
  opts: {
    method?: 'GET' | 'POST'
    query?: Record<string, string | number | undefined>
    body?: Record<string, unknown>
    extraSignParams?: Record<string, string | number | undefined>
  },
): Promise<MeituanSignedCallResult> {
  const base = meituanOpenApiBaseUrl()
  if (!base) {
    return { ok: false, message: '未配置 MEITUAN_OPENAPI_BASE_URL' }
  }

  const method = opts.method ?? 'POST'
  const params = meituanBizPayload(session, opts)
  if (opts.extraSignParams) {
    for (const [k, v] of Object.entries(opts.extraSignParams)) {
      if (v != null && v !== '' && k !== 'sign') params[k] = String(v)
    }
    delete params.sign
    params.sign = meituanSha1Sign(session.appSecret, params)
  }
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const url = new URL(`${base}${path}`)

  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const dr = await meituanServerFetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    return readMeituanHttpResult(dr)
  }

  const body = new URLSearchParams(params)
  const dr = await meituanServerFetch(url.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: body.toString(),
  })
  return readMeituanHttpResult(dr)
}

export function extractMeituanErrorMessage(j: Record<string, unknown>): string | undefined {
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
export function meituanBizError(j: Record<string, unknown>): string | undefined {
  const code = j.code ?? j.status ?? j.errno
  if (code === 0 || code === '0' || code === 'OP_SUCCESS' || code === 'success') return undefined
  if (j.success === true || j.ok === true) return undefined
  if (code == null && j.data != null) return undefined
  return extractMeituanErrorMessage(j) || `美团业务错误（code=${String(code ?? 'unknown')}）`
}

export function pickArrayFromMeituanPayload(
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
  }
  for (const k of keys) {
    const v = j[k]
    if (Array.isArray(v)) return v
  }
  if (Array.isArray(data)) return data
  return []
}
