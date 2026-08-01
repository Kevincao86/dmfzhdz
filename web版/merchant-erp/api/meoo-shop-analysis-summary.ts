/**
 * GET /api/meoo-shop-analysis-summary?startDate=&endDate=&platform=&marginPercent=
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { loadTenantAiContextForUser } from '../vite-plugins/tenantMembershipCore.js'
import {
  buildShopAdviceFacts,
  computeShopAnalysisSummary,
} from '../vite-plugins/merchantPlatformOrdersCore.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

function bearer(authHeader: string | undefined): string | undefined {
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined
}

function shanghaiTodayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function addCalendarDaysShanghai(ymd: string, deltaDays: number): string {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + deltaDays * 86_400_000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.status(204).end()
      return
    }
    if (req.method !== 'GET') {
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
    if (!ctx?.tenantId) {
      sendJson(res, 400, { ok: false, error: 'tenant_required' })
      return
    }

    const q = req.query || {}
    const get = (k: string) => {
      const v = q[k]
      return Array.isArray(v) ? String(v[0] || '') : String(v || '')
    }
    let startDate = get('startDate')
    let endDate = get('endDate')
    if (!startDate || !endDate) {
      endDate = shanghaiTodayYmd()
      startDate = addCalendarDaysShanghai(endDate, -29)
    }
    const summary = await computeShopAnalysisSummary({
      tenantId: ctx.tenantId,
      platform: get('platform') || 'douyin',
      poiId: get('poiId') || undefined,
      startYmd: startDate,
      endYmd: endDate,
      marginPercent: Number(get('marginPercent') || '0') || 0,
    })
    const facts = buildShopAdviceFacts(summary, `${startDate} ~ ${endDate}`)
    sendJson(res, 200, { ok: true, startDate, endDate, summary, adviceFacts: facts })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, msg === 'postgres_not_configured' ? 503 : 500, {
      ok: false,
      error: msg === 'postgres_not_configured' ? msg : 'shop_analysis_failed',
      detail: msg.slice(0, 400),
    })
  }
}
