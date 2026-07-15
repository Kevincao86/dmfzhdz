/**
 * Vercel Hobby 计划最多 12 个 Serverless Functions；原 40+ 个 api/*.ts 合并到本 catch-all。
 * /api/meoo-*、/api/support-*、/api/provision-tenant 等仍走原 URL，由 slug 分发。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

type HandlerModule = {
  default: (req: VercelRequest, res: VercelResponse) => Promise<void>
  config?: { maxDuration?: number }
}

const ROUTES: Record<string, () => Promise<HandlerModule>> = {
  'meoo-ai-agent-audit': () => import('./_lib/handlers/meoo-ai-agent-audit.js'),
  'meoo-feishu-test': () => import('./_lib/handlers/meoo-feishu-test.js'),
  'meoo-ops-content-image-upload': () => import('./_lib/handlers/meoo-ops-content-image-upload.js'),
  'meoo-ops-delete-sms-send': () => import('./_lib/handlers/meoo-ops-delete-sms-send.js'),
  'meoo-ops-help-manual-set': () => import('./_lib/handlers/meoo-ops-help-manual-set.js'),
  'meoo-ops-mp-announcement-list': () => import('./_lib/handlers/meoo-ops-mp-announcement-list.js'),
  'meoo-ops-mp-announcement-send': () => import('./_lib/handlers/meoo-ops-mp-announcement-send.js'),
  'meoo-ops-mp-library-delete': () => import('./_lib/handlers/meoo-ops-mp-library-delete.js'),
  'meoo-ops-mp-pr-user-register': () => import('./_lib/handlers/meoo-ops-mp-pr-user-register.js'),
  'meoo-ops-mp-recruitment-ice-confirm': () => import('./_lib/handlers/meoo-ops-mp-recruitment-ice-confirm.js'),
  'meoo-ops-mp-recruitment-ice-submit': () => import('./_lib/handlers/meoo-ops-mp-recruitment-ice-submit.js'),
  'meoo-ops-mp-recruitment-orders-append': () => import('./_lib/handlers/meoo-ops-mp-recruitment-orders-append.js'),
  'meoo-ops-mp-recruitment-orders-apply': () => import('./_lib/handlers/meoo-ops-mp-recruitment-orders-apply.js'),
  'meoo-ops-mp-recruitment-orders-delete': () => import('./_lib/handlers/meoo-ops-mp-recruitment-orders-delete.js'),
  'meoo-ops-mp-recruitment-orders-list': () => import('./_lib/handlers/meoo-ops-mp-recruitment-orders-list.js'),
  'meoo-ops-mp-recruitment-orders-patch': () => import('./_lib/handlers/meoo-ops-mp-recruitment-orders-patch.js'),
  'meoo-ops-mp-talent-member-register': () => import('./_lib/handlers/meoo-ops-mp-talent-member-register.js'),
  'meoo-ops-ping': () => import('./_lib/handlers/meoo-ops-ping.js'),
  'meoo-ops-recruitment-orders-append': () => import('./_lib/handlers/meoo-ops-recruitment-orders-append.js'),
  'meoo-ops-recruitment-orders-patch': () => import('./_lib/handlers/meoo-ops-recruitment-orders-patch.js'),
  'meoo-ops-registry-tenant-delete': () => import('./_lib/handlers/meoo-ops-registry-tenant-delete.js'),
  'meoo-ops-staff-list': () => import('./_lib/handlers/meoo-ops-staff-list.js'),
  'meoo-ops-staff-login': () => import('./_lib/handlers/meoo-ops-staff-login.js'),
  'meoo-ops-staff-mutate': () => import('./_lib/handlers/meoo-ops-staff-mutate.js'),
  'meoo-ops-sync-registry': () => import('./_lib/handlers/meoo-ops-sync-registry.js'),
  'meoo-ops-team-intro-set': () => import('./_lib/handlers/meoo-ops-team-intro-set.js'),
  'meoo-ops-platform-decor-set': () => import('./_lib/handlers/meoo-ops-platform-decor-set.js'),
  'meoo-supabase-payment-orders-confirm': () => import('./_lib/handlers/meoo-supabase-payment-orders-confirm.js'),
  'meoo-supabase-payment-orders-list': () => import('./_lib/handlers/meoo-supabase-payment-orders-list.js'),
  'meoo-supabase-payment-orders-verify': () => import('./_lib/handlers/meoo-supabase-payment-orders-verify.js'),
  'meoo-supabase-tenants-delete': () => import('./_lib/handlers/meoo-supabase-tenants-delete.js'),
  'meoo-supabase-tenants-list': () => import('./_lib/handlers/meoo-supabase-tenants-list.js'),
  'meoo-supabase-tenants-patch': () => import('./_lib/handlers/meoo-supabase-tenants-patch.js'),
  'meoo-supabase-tenants-reset-password': () => import('./_lib/handlers/meoo-supabase-tenants-reset-password.js'),
  'meoo-supabase-tenants-tokenmix': () => import('./_lib/handlers/meoo-supabase-tenants-tokenmix.js'),
  'meoo-support-relay-ping': () => import('./_lib/handlers/meoo-support-relay-ping.js'),
  'meoo-tenant-announcements-list': () => import('./_lib/handlers/meoo-tenant-announcements-list.js'),
  'meoo-tenant-announcements-send': () => import('./_lib/handlers/meoo-tenant-announcements-send.js'),
  'provision-tenant': () => import('./_lib/handlers/provision-tenant.js'),
  'support-ops-send': () => import('./_lib/handlers/support-ops-send.js'),
  'support-poll': () => import('./_lib/handlers/support-poll.js'),
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
  if (pathOnly.startsWith('/api/')) {
    const rest = pathOnly.slice('/api/'.length)
    return rest ? rest.split('/').filter(Boolean) : []
  }
  return []
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = slugSegmentsFromRequest(req)
  const routeKey = parts.join('/')
  const load = ROUTES[routeKey]
  if (!load) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(404).send(JSON.stringify({ ok: false, error: 'api_route_not_found', route: routeKey || '(empty)' }))
    return
  }
  const mod = await load()
  return mod.default(req, res)
}
