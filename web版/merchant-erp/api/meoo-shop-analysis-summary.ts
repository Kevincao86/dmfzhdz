/**
 * GET /api/meoo-shop-analysis-summary?startDate=&endDate=&platform=&marginPercent=
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readRequestBearer, verifyAccessToken } from '../vite-plugins/aiGateway/authSupabase.js'
import { loadTenantAiContextForUser } from '../vite-plugins/tenantMembershipCore.js'
import {
  buildShopAdviceFacts,
  computeShopAnalysisSummary,
  type ShopAnalysisSummary,
} from '../vite-plugins/merchantPlatformOrdersCore.js'
import {
  fetchDouyinFinanceReconcileRows,
  type DouyinLiveBuyerStats,
} from '../vite-plugins/douyinMerchantGateway.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

function shanghaiTodayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function headerToken(req: VercelRequest, name: string): string {
  const raw = req.headers[name]
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' ? v.trim() : ''
}

function applyLiveDouyinTotals(
  summary: ShopAnalysisSummary,
  rows: Array<{
    salesAmountYuan?: number
    verifyAmountYuan?: number
    orderCount?: number
    refundAmountYuan?: number
    refundCouponCount?: number
  }>,
): ShopAnalysisSummary {
  let sales = 0
  let verify = 0
  let coupons = 0
  let refundYuan = 0
  let refundCoupons = 0
  for (const row of rows) {
    sales += Number(row.salesAmountYuan) || 0
    verify += Number(row.verifyAmountYuan) || 0
    coupons += Number(row.orderCount) || 0
    refundYuan += Number(row.refundAmountYuan) || 0
    refundCoupons += Number(row.refundCouponCount) || 0
  }
  const liveHas = sales > 0 || verify > 0 || coupons > 0 || refundYuan > 0 || refundCoupons > 0
  if (!liveHas) return summary
  const salesYuan = Math.round(sales * 100) / 100
  const refundAmountYuan = Math.round(refundYuan * 100) / 100
  return {
    ...summary,
    orderCount: coupons,
    couponCount: coupons,
    salesAmountYuan: salesYuan,
    verifyAmountYuan: Math.round(verify * 100) / 100,
    refundAmountYuan,
    refundCount: refundCoupons,
    refundCouponCount: refundCoupons,
    refundRate: salesYuan > 0 ? Math.round((refundAmountYuan / salesYuan) * 10000) / 100 : 0,
  }
}

/** 来客实时单里识别到买家时，补上被金额覆盖后仍为 0 的客群指标 */
function applyLiveBuyerStats(summary: ShopAnalysisSummary, stats?: DouyinLiveBuyerStats): ShopAnalysisSummary {
  if (!stats || stats.buyerCount <= 0) return summary
  if (summary.buyerCount > 0 && summary.openIdCoverage >= stats.openIdCoverage) return summary
  const salesYuan = summary.salesAmountYuan
  const newBuyerShare =
    salesYuan > 0 ? Math.round((stats.newBuyerSalesYuan / salesYuan) * 10000) / 100 : stats.newBuyerShare
  return {
    ...summary,
    buyerCount: stats.buyerCount,
    openIdCoverage: stats.openIdCoverage,
    newBuyerCount: stats.newBuyerCount,
    oldBuyerCount: stats.oldBuyerCount,
    newBuyerSalesYuan: stats.newBuyerSalesYuan,
    oldBuyerSalesYuan: stats.oldBuyerSalesYuan,
    newBuyerShare,
    newBuyerPeopleShare: stats.newBuyerPeopleShare,
    oneTimeBuyerCount: stats.oneTimeBuyerCount,
    repeatBuyerCount: stats.repeatBuyerCount,
    repurchaseRate: stats.repurchaseRate,
    guestBasis: 'repurchase',
    hasPreWindowHistory: summary.hasPreWindowHistory,
  }
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
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Meoo-Access-Token, X-Meoo-Douyin-Token',
      )
      res.status(204).end()
      return
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }
    const token = readRequestBearer(req.headers as Record<string, unknown>)
    if (!token) {
      sendJson(res, 401, { ok: false, error: 'unauthorized', detail: 'missing_token' })
      return
    }
    const env = process.env as Record<string, string>
    let user: Awaited<ReturnType<typeof verifyAccessToken>>
    try {
      user = await verifyAccessToken(token, env)
    } catch {
      sendJson(res, 401, { ok: false, error: 'unauthorized', detail: 'invalid_token' })
      return
    }
    if (!user?.id) {
      sendJson(res, 401, { ok: false, error: 'unauthorized', detail: 'invalid_token' })
      return
    }
    const q = req.query || {}
    const get = (k: string) => {
      const v = q[k]
      return Array.isArray(v) ? String(v[0] || '') : String(v || '')
    }
    const ctx = await loadTenantAiContextForUser(user.id, env, token, get('tenantId') || undefined)
    if (!ctx?.tenantId) {
      sendJson(res, 400, { ok: false, error: 'tenant_required' })
      return
    }
    let startDate = get('startDate')
    let endDate = get('endDate')
    if (!startDate || !endDate) {
      endDate = shanghaiTodayYmd()
      startDate = addCalendarDaysShanghai(endDate, -29)
    }
    let summary = await computeShopAnalysisSummary({
      tenantId: ctx.tenantId,
      platform: get('platform') || 'douyin',
      poiId: get('poiId') || undefined,
      startYmd: startDate,
      endYmd: endDate,
      marginPercent: Number(get('marginPercent') || '0') || 0,
    })
    const platform = (get('platform') || 'douyin').trim()
    const douyinToken = headerToken(req, 'x-meoo-douyin-token')
    if (douyinToken && (platform === 'douyin' || platform === 'all')) {
      try {
        const live = await fetchDouyinFinanceReconcileRows(douyinToken, startDate, endDate)
        summary = applyLiveDouyinTotals(summary, live.rows)
        summary = applyLiveBuyerStats(summary, live.buyerStats)
      } catch {
        /* 来客实时失败时保留本地订单汇总 */
      }
    }
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
