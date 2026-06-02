/** Vercel 根 api/ 内：转发 ECS erp-api（避免经 web版 路径 re-export 导致构建失败） */

const FETCH_TIMEOUT_MS = 25_000

function fetchTimeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

function erpApiBases(): string[] {
  const raw = [
    process.env.MEOO_ERP_API_BASE,
    process.env.VITE_ERP_AUTH_API_BASE,
    process.env.ERP_AUTH_API_BASE,
    'https://mofangdianai.com/erp-api',
  ]
  const out: string[] = []
  for (const item of raw) {
    let b = String(item ?? '')
      .trim()
      .replace(/\/$/, '')
    if (!b) continue
    if (/api\.mofangdianai\.com/i.test(b)) b = 'https://mofangdianai.com/erp-api'
    if (!out.includes(b)) out.push(b)
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
      const r = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: fetchTimeoutSignal(FETCH_TIMEOUT_MS),
      })
      const text = await r.text()
      if (!r.ok) {
        last = `${r.status}:${text.slice(0, 120)}`
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
  let last = 'erp_api_proxy_failed'
  for (const base of erpApiBases()) {
    const url = `${base}/${rel}`
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: fetchTimeoutSignal(FETCH_TIMEOUT_MS),
      })
      const text = await r.text()
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(text || '{}') as Record<string, unknown>
      } catch {
        data = { ok: false, error: 'invalid_json', detail: text.slice(0, 200) }
      }
      return { status: r.status, data }
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(last)
}
