/** 与仓库根 api/mpErpApiProxy.ts 保持一致（勿 re-export 根目录，避免 tsc 拉 @vercel/node） */

import https from 'node:https'

const FETCH_TIMEOUT_MS = 25_000
const DEFAULT_ERP_IP = '139.196.42.5'

function erpApiBases(): string[] {
  const raw = [
    process.env.MEOO_ERP_API_BASE,
    process.env.VITE_ERP_AUTH_API_BASE,
    process.env.ERP_AUTH_API_BASE,
    'https://api.mofangdianai.com/erp-api',
    'https://mofangdianai.com/erp-api',
  ]
  const out: string[] = []
  for (const item of raw) {
    const b = String(item ?? '')
      .trim()
      .replace(/\/$/, '')
    if (!b || out.includes(b)) continue
    out.push(b)
  }
  return out
}

function relPath(apiPath: string): string {
  const p = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  return p.replace(/^\/api\//, '')
}

function erpHostIp(): string {
  const ip = String(process.env.MEOO_ERP_API_HOST_IP || DEFAULT_ERP_IP).trim()
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : DEFAULT_ERP_IP
}

function shouldConnectViaIp(hostname: string): boolean {
  return /^(mofangdianai\.com|api\.mofangdianai\.com)$/i.test(hostname)
}

function httpsErpRequest(
  url: string,
  method: 'GET' | 'POST',
  body?: string,
): Promise<{ status: number; text: string }> {
  const parsed = new URL(url)
  const useIp = shouldConnectViaIp(parsed.hostname)
  const host = useIp ? erpHostIp() : parsed.hostname
  const path = `${parsed.pathname}${parsed.search}`
  const sni = parsed.hostname

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
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
        timeout: FETCH_TIMEOUT_MS,
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
      reject(new Error('erp_https_timeout'))
    })
    if (body) req.write(body)
    req.end()
  })
}

export async function proxyGetErpApi(apiPath: string): Promise<Record<string, unknown>> {
  const rel = relPath(apiPath)
  let last = 'erp_api_proxy_failed'
  for (const base of erpApiBases()) {
    const url = `${base}/${rel}`
    try {
      const { status, text } = await httpsErpRequest(url, 'GET')
      if (status < 200 || status >= 300) {
        last = `${status}:${text.slice(0, 120)}`
        continue
      }
      return JSON.parse(text || '{}') as Record<string, unknown>
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(last)
}

export async function proxyPostErpApi(
  apiPath: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const rel = relPath(apiPath)
  const payload = JSON.stringify(body)
  let last = 'erp_api_proxy_failed'
  for (const base of erpApiBases()) {
    const url = `${base}/${rel}`
    try {
      const { status, text } = await httpsErpRequest(url, 'POST', payload)
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(text || '{}') as Record<string, unknown>
      } catch {
        data = { ok: false, error: 'invalid_json', detail: text.slice(0, 200) }
      }
      return { status, data }
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(last)
}
