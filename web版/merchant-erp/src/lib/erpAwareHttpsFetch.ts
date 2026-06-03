/**
 * 出站访问 ECS（mofangdianai.com）时部分网络会对 hostname TLS reset；
 * 与 mpErpApiProxy 一致：对根域用公网 IP + SNI + node:https。
 */
import https from 'node:https'

const DEFAULT_ERP_IP = '139.196.42.5'

function erpHostIp(): string {
  const ip = String(process.env.MEOO_ERP_API_HOST_IP || DEFAULT_ERP_IP).trim()
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : DEFAULT_ERP_IP
}

function shouldUseIp(hostname: string): boolean {
  return /^(mofangdianai\.com|api\.mofangdianai\.com)$/i.test(hostname)
}

export function erpAwareFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return fetch(url, init)
  }
  if (!shouldUseIp(parsed.hostname)) {
    return fetch(url, init)
  }

  const method = String(init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  const body =
    init.body == null
      ? undefined
      : typeof init.body === 'string'
        ? init.body
        : Buffer.isBuffer(init.body)
          ? init.body
          : undefined

  const ip = erpHostIp()
  const path = `${parsed.pathname}${parsed.search}`
  const sni = parsed.hostname

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        port: 443,
        path,
        method,
        servername: sni,
        rejectUnauthorized: false,
        headers: Object.fromEntries(headers.entries()),
        timeout: 25_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve(
            new Response(text, {
              status: res.statusCode || 0,
              headers: res.headers as HeadersInit,
            }),
          )
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('erp_aware_fetch_timeout'))
    })
    if (body) req.write(body)
    req.end()
  })
}
