/**
 * 首页数据看板：按时间维度聚合各平台订单/核销（复用财务对账拉数逻辑）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchDouyinAkteReviews, fetchDouyinFinanceReconcileRows } from './douyinMerchantGateway.js'
import { fetchMeituanFinanceReconcileRows, fetchMeituanReviews } from './meituanMerchantGateway.js'
import { decodeMeituanSessionToken } from './meituanOpenApiCore.js'
import { decodeXhsSessionToken } from './xhsOpenApiCore.js'
import { fetchXhsFinanceReconcileRows, fetchXhsReviews } from './xhsMerchantGateway.js'

export type DashboardRange = 'realtime' | 'day7' | 'day30'
type DashboardPlatform = 'douyin' | 'meituan' | 'xhs'

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function shanghaiTodayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function addCalendarDaysShanghai(ymd: string, deltaDays: number): string {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + deltaDays * 86_400_000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function ymdToTrendLabel(ymd: string): string {
  const p = ymd.split('-')
  if (p.length !== 3) return ymd
  return `${p[1]}-${p[2]}`
}

function parseRange(raw: string | null): DashboardRange {
  if (raw === 'day7' || raw === 'day30') return raw
  return 'realtime'
}

function rangeToYmd(range: DashboardRange): { startYmd: string; endYmd: string } {
  const endYmd = shanghaiTodayYmd()
  const back = range === 'realtime' ? 0 : range === 'day7' ? 6 : 29
  return { startYmd: addCalendarDaysShanghai(endYmd, -back), endYmd }
}

function parseBearer(req: IncomingMessage): string | undefined {
  return req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
}

function headerToken(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name]
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || typeof v !== 'string') return undefined
  const m = /^Bearer\s+(\S+)/i.exec(v.trim())
  return m?.[1]?.trim() || undefined
}

function resolvePlatformBearer(req: IncomingMessage, platform: DashboardPlatform): string | null {
  if (platform === 'douyin') {
    return headerToken(req, 'x-meoo-douyin-token') ?? parseBearer(req) ?? null
  }
  if (platform === 'meituan') {
    const mt = headerToken(req, 'x-meoo-meituan-token')
    if (mt) return mt
    const auth = parseBearer(req)
    if (auth && decodeMeituanSessionToken(auth)) return auth
    return null
  }
  const xh = headerToken(req, 'x-meoo-xhs-token')
  if (xh) return xh
  const auth = parseBearer(req)
  if (auth && decodeXhsSessionToken(auth)) return auth
  return null
}

type ReconcileRow = {
  date: string
  orderCount: number
  verifyOrderCount: number
  salesAmountYuan: number
  verifyAmountYuan: number
}

async function loadReconcileRows(
  platform: DashboardPlatform,
  bearer: string,
  startYmd: string,
  endYmd: string,
): Promise<ReconcileRow[]> {
  if (platform === 'douyin') {
    const r = await fetchDouyinFinanceReconcileRows(bearer, startYmd, endYmd)
    return r.rows
  }
  if (platform === 'meituan') {
    const r = await fetchMeituanFinanceReconcileRows(bearer, startYmd, endYmd)
    return r.rows
  }
  const r = await fetchXhsFinanceReconcileRows(bearer, startYmd, endYmd)
  return r.rows
}

function aggregateDashboard(rows: ReconcileRow[]) {
  let payAmount = 0
  let verifyAmount = 0
  let orderCount = 0
  let verifyOrderCount = 0
  const trendMap = new Map<string, number>()
  for (const row of rows) {
    payAmount += row.salesAmountYuan
    verifyAmount += row.verifyAmountYuan
    orderCount += row.orderCount
    verifyOrderCount += row.verifyOrderCount
    const label = ymdToTrendLabel(row.date)
    trendMap.set(label, (trendMap.get(label) ?? 0) + row.salesAmountYuan)
  }
  const conversionRate =
    orderCount > 0 ? Math.round((verifyOrderCount / orderCount) * 1000) / 10 : 0
  const trend = [...trendMap.entries()].map(([date, pay]) => ({
    date,
    payAmount: Math.round(pay * 100) / 100,
  }))
  return {
    payAmount: Math.round(payAmount * 100) / 100,
    verifyAmount: Math.round(verifyAmount * 100) / 100,
    conversionRate,
    orderCount,
    trend,
  }
}

export async function handleMerchantDashboardSummaryGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  platform: DashboardPlatform,
): Promise<void> {
  const bearer = resolvePlatformBearer(req, platform)
  if (!bearer?.trim()) {
    json(res, 401, { ok: false, message: '请先绑定平台账号后再查看看板数据' })
    return
  }
  const range = parseRange(url.searchParams.get('range'))
  const { startYmd, endYmd } = rangeToYmd(range)
  try {
    const rows = await loadReconcileRows(platform, bearer.trim(), startYmd, endYmd)
    const data = aggregateDashboard(rows)
    json(res, 200, { ok: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { ok: false, message: msg.slice(0, 400) })
  }
}

async function countUnrepliedReviews(bearer: string, platform: DashboardPlatform): Promise<number> {
  if (platform === 'douyin') {
    const r = await fetchDouyinAkteReviews(bearer)
    if (r.ok === false) return 0
    return r.items.filter((x) => !x.replied).length
  }
  if (platform === 'meituan') {
    const r = await fetchMeituanReviews(bearer)
    if (r.ok === false) return 0
    return r.items.filter((x) => !x.replied).length
  }
  const r = await fetchXhsReviews(bearer)
  if (r.ok === false) return 0
  return r.items.filter((x) => !x.replied).length
}

/** GET /api/merchant/home/extra-stats — 待处理评论等补充指标 */
export async function handleMerchantHomeExtraStatsGet(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let pendingComments = 0
  const douyin = headerToken(req, 'x-meoo-douyin-token') ?? parseBearer(req)
  const meituan = headerToken(req, 'x-meoo-meituan-token')
  const xhs = headerToken(req, 'x-meoo-xhs-token')

  if (douyin?.trim()) pendingComments += await countUnrepliedReviews(douyin.trim(), 'douyin')
  if (meituan?.trim()) pendingComments += await countUnrepliedReviews(meituan.trim(), 'meituan')
  if (xhs?.trim()) pendingComments += await countUnrepliedReviews(xhs.trim(), 'xhs')

  json(res, 200, {
    ok: true,
    data: {
      fansGrowth: 0,
      todayNewLeads: 0,
      pendingComments,
    },
  })
}
