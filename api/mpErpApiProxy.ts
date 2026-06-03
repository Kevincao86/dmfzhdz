/** Vercel 根 api：转发 ECS erp-api（hostname fetch 优先，失败再 IP+SNI） */

import { fetchErpDual } from '../web版/merchant-erp/src/lib/erpHttpsDualFetch.js'

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

export async function proxyGetErpApi(apiPath: string): Promise<Record<string, unknown>> {
  const rel = relPath(apiPath)
  let last = 'erp_api_proxy_failed'
  for (const base of erpApiBases()) {
    const url = `${base}/${rel}`
    try {
      const { status, text } = await fetchErpDual(url, 'GET')
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
      const { status, text } = await fetchErpDual(url, 'POST', payload)
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
