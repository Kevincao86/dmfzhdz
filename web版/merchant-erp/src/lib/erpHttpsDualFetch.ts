/**
 * 方案 B：Vercel Serverless 访问轻量 Supabase（GoTrue / PostgREST）。
 * 备案期外网 HTTPS + 域名 SNI 会被 reset；MEOO_ERP_BEIAN_BYPASS=1 时：
 *   1) 优先 HTTP:80 + Host:公网IP（轻量 Nginx 反代 /auth/v1、/rest/v1）
 *   2) 再试 HTTPS:443 + Host:mofangdianai.com（无域名 SNI）
 */
import http from 'node:http'
import https from 'node:https'

const DEFAULT_ERP_IP = '139.196.42.5'
const TIMEOUT_MS = 25_000

type ErpHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

function erpHostIp(): string {
  const ip = String(process.env.MEOO_ERP_API_HOST_IP || DEFAULT_ERP_IP).trim()
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : DEFAULT_ERP_IP
}

/** 备案未完成时 Vercel 设 1：优先 IP bypass，跳过必失败的域名 TLS */
function beianBypassPreferred(): boolean {
  const v = String(process.env.MEOO_ERP_BEIAN_BYPASS ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function isErpHost(hostname: string): boolean {
  return /^(mofangdianai\.com|api\.mofangdianai\.com)$/i.test(hostname)
}

function timeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

/** 备案 bypass 第一步：HTTP:80，Nginx server_name 为公网 IP */
function httpViaIp(
  url: string,
  method: ErpHttpMethod,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; text: string }> {
  const parsed = new URL(url)
  const path = `${parsed.pathname}${parsed.search}`
  const ip = erpHostIp()

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: ip,
        port: 80,
        path,
        method,
        headers: {
          Host: ip,
          Accept: 'application/json',
          ...(extraHeaders ?? {}),
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {}),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') })
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('beian_http_timeout'))
    })
    if (body) req.write(body)
    req.end()
  })
}

/** 备案 bypass 第二步：HTTPS:443 连 IP，Host 头用域名路由 Nginx default_server */
function httpsViaIp(
  url: string,
  method: ErpHttpMethod,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; text: string }> {
  const parsed = new URL(url)
  const path = `${parsed.pathname}${parsed.search}`
  const hostHeader = parsed.hostname

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: erpHostIp(),
        port: 443,
        path,
        method,
        rejectUnauthorized: false,
        headers: {
          Host: hostHeader,
          Accept: 'application/json',
          ...(extraHeaders ?? {}),
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {}),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') })
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('beian_https_timeout'))
    })
    if (body) req.write(body)
    req.end()
  })
}

async function fetchViaHostname(
  url: string,
  method: ErpHttpMethod,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; text: string }> {
  const r = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(extraHeaders ?? {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
    signal: timeoutSignal(TIMEOUT_MS),
  })
  return { status: r.status, text: await r.text() }
}

function pickExtraHeaders(init?: RequestInit): Record<string, string> {
  const raw = init?.headers
  if (!raw) return {}
  if (raw instanceof Headers) {
    const out: Record<string, string> = {}
    raw.forEach((v, k) => {
      const lk = k.toLowerCase()
      if (lk === 'content-type' || lk === 'accept') return
      out[k] = v
    })
    return out
  }
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [k, v] of raw) {
      const lk = k.toLowerCase()
      if (lk === 'content-type' || lk === 'accept') continue
      out[k] = v
    }
    return out
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    const lk = k.toLowerCase()
    if (lk === 'content-type' || lk === 'accept') continue
    if (typeof v === 'string') out[k] = v
  }
  return out
}

/** 拉取 ECS Supabase URL：备案期 HTTP:80 IP → HTTPS IP → 域名 */
export async function fetchErpDual(
  url: string,
  method: ErpHttpMethod = 'GET',
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; text: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return fetchViaHostname(url, method, body, extraHeaders)
  }

  if (!isErpHost(parsed.hostname)) {
    return fetchViaHostname(url, method, body, extraHeaders)
  }

  if (beianBypassPreferred()) {
    let httpErr = ''
    try {
      const out = await httpViaIp(url, method, body, extraHeaders)
      if (out.status > 0 && !out.text.trimStart().startsWith('<')) return out
      httpErr = out.status === 0 ? 'empty' : `http_${out.status}_html`
    } catch (e) {
      httpErr = e instanceof Error ? e.message : String(e)
    }
    try {
      return await httpsViaIp(url, method, body, extraHeaders)
    } catch (ipErr) {
      const b = ipErr instanceof Error ? ipErr.message : String(ipErr)
      throw new Error(`beian_http:${httpErr || 'fail'} | beian_ip:${b}`)
    }
  }

  let hostErr = ''
  try {
    const out = await fetchViaHostname(url, method, body, extraHeaders)
    if (out.status >= 200 && out.status < 500) return out
    hostErr = `host_http_${out.status}`
  } catch (e) {
    hostErr = e instanceof Error ? e.message : String(e)
  }

  try {
    return await httpsViaIp(url, method, body, extraHeaders)
  } catch (ipErr) {
    const b = ipErr instanceof Error ? ipErr.message : String(ipErr)
    throw new Error(`host:${hostErr || 'fail'} | ip:${b}`)
  }
}

export function erpAwareFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = String(init.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
    return fetch(url, init)
  }
  const body =
    init.body == null
      ? undefined
      : typeof init.body === 'string'
        ? init.body
        : undefined
  const extraHeaders = pickExtraHeaders(init)
  return fetchErpDual(url, method as ErpHttpMethod, body, extraHeaders).then(({ status, text }) => {
    if (status === 204 || status === 205) {
      return new Response(null, { status })
    }
    return new Response(text, { status })
  })
}
