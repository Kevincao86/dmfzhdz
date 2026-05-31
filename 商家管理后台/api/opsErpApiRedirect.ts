/**
 * Vercel 运营台无法出站访问 ECS Supabase：注册表读写改由浏览器经 307 跳转至 erp-api。
 */
import type { VercelResponse } from '@vercel/node'

export function opsErpApiBaseFromEnv(): string {
  const raw = (
    process.env.VITE_MEEO_OPS_API_BASE ??
    process.env.VITE_MEEO_SUPPORT_OPS_API_BASE ??
    'https://mofangdianai.com/erp-api'
  )
    .trim()
    .replace(/\/$/, '')
  if (/api\.mofangdianai\.com/i.test(raw)) return 'https://mofangdianai.com/erp-api'
  return raw || 'https://mofangdianai.com/erp-api'
}

/** `/api/meoo-ops-sync-registry` → `https://mofangdianai.com/erp-api/meoo-ops-sync-registry` */
export function erpApiAbsoluteUrl(apiPath: string): string {
  const p = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const rel = p.replace(/^\/api\//, '')
  return `${opsErpApiBaseFromEnv()}/${rel}`
}

export function sendErpApiRedirectCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

/** 307 到 ECS erp-api；fetch 默认 follow，跨域目标须返回 CORS（auth-api 已配置）。 */
export function redirectRegistryToErpApi(res: VercelResponse, apiPath: string): void {
  sendErpApiRedirectCors(res)
  res.setHeader('Location', erpApiAbsoluteUrl(apiPath))
  res.status(307).end()
}
