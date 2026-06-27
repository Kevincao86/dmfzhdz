/**
 * /api/ops-supabase/* — 3 个子路由合并为 1 个 Serverless Function（Hobby 12 上限）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

type HandlerModule = {
  default: (req: VercelRequest, res: VercelResponse) => Promise<void>
  config?: { maxDuration?: number }
}

const ROUTES: Record<string, () => Promise<HandlerModule>> = {
  'payment-orders/delete': () => import('../_lib/handlers/ops-supabase/payment-orders/delete.js'),
  'tenants/insights': () => import('../_lib/handlers/ops-supabase/tenants/insights.js'),
  'tenants/wallet-ledger': () => import('../_lib/handlers/ops-supabase/tenants/wallet-ledger.js'),
}

export const config = { maxDuration: 60 }

function slugSegmentsFromRequest(req: VercelRequest): string[] {
  const slug = req.query.slug
  if (Array.isArray(slug)) return slug.map(String).filter(Boolean)
  if (typeof slug === 'string' && slug.trim()) {
    return slug.includes('/') ? slug.split('/').filter(Boolean) : [slug.trim()]
  }
  const url = typeof req.url === 'string' ? req.url : ''
  const pathOnly = url.split('?')[0]?.trim() ?? ''
  const prefix = '/api/ops-supabase/'
  if (pathOnly.startsWith(prefix)) {
    const rest = pathOnly.slice(prefix.length)
    return rest ? rest.split('/').filter(Boolean) : []
  }
  return []
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const routeKey = slugSegmentsFromRequest(req).join('/')
  const load = ROUTES[routeKey]
  if (!load) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(404).send(JSON.stringify({ ok: false, error: 'ops_supabase_route_not_found', route: routeKey || '(empty)' }))
    return
  }
  const mod = await load()
  return mod.default(req, res)
}
