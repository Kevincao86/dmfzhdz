/**
 * 访问 ECS 域名：先 fetch(hostname)，失败再 node:https(IP+SNI)。
 * Vercel 对裸 IP 常 ECONNRESET，对域名 fetch 有时可用。
 */
import https from 'node:https'

const DEFAULT_ERP_IP = '139.196.42.5'
const TIMEOUT_MS = 25_000

function erpHostIp(): string {
  const ip = String(process.env.MEOO_ERP_API_HOST_IP || DEFAULT_ERP_IP).trim()
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : DEFAULT_ERP_IP
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
  method: 'GET' | 'POST',
  body?: string,
): Promise<{ status: number; text: string }> {
  const parsed = new URL(url)
  const path = `${parsed.pathname}${parsed.search}`
  const sni = parsed.hostname

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: erpHostIp(),
        port: 443,
        path,
        method,
        servername: sni,
        rejectUnauthorized: false,
        headers: {
          Host: sni,
          Accept: 'application/json',
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
  method: 'GET' | 'POST',
  body?: string,
): Promise<{ status: number; text: string }> {
  const r = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
    signal: timeoutSignal(TIMEOUT_MS),
  })
  return { status: r.status, text: await r.text() }
}

/** 拉取 ECS URL：hostname fetch → IP+SNI */
export async function fetchErpDual(
  url: string,
  method: 'GET' | 'POST' = 'GET',
  body?: string,
): Promise<{ status: number; text: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return fetchViaHostname(url, method, body)
  }

  if (!isErpHost(parsed.hostname)) {
    return fetchViaHostname(url, method, body)
  }

  let hostErr = ''
  try {
    const out = await fetchViaHostname(url, method, body)
    if (out.status >= 200 && out.status < 500) return out
    hostErr = `host_http_${out.status}`
  } catch (e) {
    hostErr = e instanceof Error ? e.message : String(e)
  }

  try {
    return await httpsViaIp(url, method, body)
  } catch (ipErr) {
    const b = ipErr instanceof Error ? ipErr.message : String(ipErr)
    throw new Error(`host:${hostErr || 'fail'} | ip:${b}`)
  }
}

export function erpAwareFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = String(init.method || 'GET').toUpperCase() as 'GET' | 'POST'
  const body =
    init.body == null
      ? undefined
      : typeof init.body === 'string'
        ? init.body
        : undefined
  return fetchErpDual(url, method, body).then(
    ({ status, text }) => new Response(text, { status }),
  )
}
