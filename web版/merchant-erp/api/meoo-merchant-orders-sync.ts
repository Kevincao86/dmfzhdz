/**
 * POST /api/meoo-merchant-orders-sync
 * body: { startDate, endDate, platform?: 'douyin' }
 * 拉取抖音来客逐单并 UPSERT 到 merchant_platform_orders
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { loadTenantAiContextForUser } from '../vite-plugins/tenantMembershipCore.js'
import { fetchDouyinTradeOrderDetails } from '../vite-plugins/douyinMerchantGateway.js'
import { upsertDouyinOrders } from '../vite-plugins/merchantPlatformOrdersCore.js'

export const config = { maxDuration: 120 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

function bearer(authHeader: string | undefined): string | undefined {
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined
}

function headerToken(req: VercelRequest, name: string): string | undefined {
  const raw = req.headers[name]
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || typeof v !== 'string') return undefined
  const m = /^Bearer\s+(\S+)/i.exec(v.trim())
  return (m?.[1] || v).trim() || undefined
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Meoo-Douyin-Token')
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const token = bearer(req.headers.authorization)
    if (!token) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const env = process.env as Record<string, string>
    let user: Awaited<ReturnType<typeof verifyBearerJwt>>
    try {
      user = await verifyBearerJwt(`Bearer ${token}`, env)
    } catch {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    if (!user?.id) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const ctx = await loadTenantAiContextForUser(user.id, env)
    const tenantId = ctx?.tenantId
    if (!tenantId) {
      sendJson(res, 400, { ok: false, error: 'tenant_required' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const startDate = String(body.startDate || '').trim()
    const endDate = String(body.endDate || '').trim()
    if (!isYmd(startDate) || !isYmd(endDate) || startDate > endDate) {
      sendJson(res, 400, { ok: false, error: 'invalid_date_range' })
      return
    }

    const douyinToken =
      headerToken(req, 'x-meoo-douyin-token') ||
      (typeof body.douyinToken === 'string' ? body.douyinToken.trim() : '') ||
      ''
    if (!douyinToken) {
      sendJson(res, 400, { ok: false, error: 'douyin_token_required', message: '请先绑定抖音来客' })
      return
    }

    const pulled = await fetchDouyinTradeOrderDetails(douyinToken, startDate, endDate)
    const { upserted } = await upsertDouyinOrders(tenantId, pulled.orders)
    sendJson(res, 200, {
      ok: true,
      platform: 'douyin',
      pulled: pulled.orders.length,
      upserted,
      warnings: pulled.warnings,
      startDate,
      endDate,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, msg === 'postgres_not_configured' ? 503 : 500, {
      ok: false,
      error: msg === 'postgres_not_configured' ? msg : 'orders_sync_failed',
      detail: msg.slice(0, 400),
    })
  }
}
