/**
 * 访问 ECS：先 fetch 域名，失败再 node:https 连公网 IP。
 * 备案期外网带 SNI 域名会被阿里云 reset；IP 连接勿发域名 SNI，仅用 Host 头路由。
 */
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
        // 备案期：禁止 SNI 域名（外网 reset）；Nginx default_server + Host 头即可
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
      reject(new Error('erp_ip_timeout'))
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

/** 拉取 ECS URL：域名 fetch → IP（无域名 SNI） */
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
    try {
      return await httpsViaIp(url, method, body, extraHeaders)
    } catch (ipErr) {
      const b = ipErr instanceof Error ? ipErr.message : String(ipErr)
      throw new Error(`beian_ip:${b}`)
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
    // Node fetch：204/205 不得带 body，否则 Response 构造抛错
    if (status === 204 || status === 205) {
      return new Response(null, { status })
    }
    return new Response(text, { status })
  })
}
