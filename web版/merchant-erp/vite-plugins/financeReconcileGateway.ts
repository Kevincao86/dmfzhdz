/**
 * GET /api/merchant/finance/reconcile
 * 聚合各平台对账数据：抖音来客走开放平台真实接口；美团/小红书待接开放平台后在此扩展。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchDouyinFinanceReconcileRows } from './douyinMerchantGateway'

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function parseBearer(req: IncomingMessage): string | undefined {
  return req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
}

function shanghaiTodayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function addCalendarDaysShanghai(ymd: string, deltaDays: number): string {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + deltaDays * 86_400_000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function daysBetweenInclusive(a: string, b: string): number {
  const ta = new Date(`${a}T12:00:00+08:00`).getTime()
  const tb = new Date(`${b}T12:00:00+08:00`).getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 999
  return Math.floor(Math.abs(tb - ta) / 86_400_000) + 1
}

export async function handleFinanceReconcileGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const startQ = (url.searchParams.get('startDate') ?? '').trim()
  const endQ = (url.searchParams.get('endDate') ?? '').trim()
  const daysRaw = url.searchParams.get('days')

  let startYmd: string
  let endYmd: string

  if (startQ && endQ) {
    if (!isYmd(startQ) || !isYmd(endQ)) {
      json(res, 400, { ok: false, message: 'startDate / endDate 须为 YYYY-MM-DD' })
      return
    }
    if (startQ > endQ) {
      json(res, 400, { ok: false, message: '开始日期不能晚于结束日期' })
      return
    }
    if (daysBetweenInclusive(startQ, endQ) > 90) {
      json(res, 400, { ok: false, message: '自定义区间最长 90 天' })
      return
    }
    startYmd = startQ
    endYmd = endQ
  } else {
    const days = Math.min(90, Math.max(1, Number(daysRaw ?? '14') || 14))
    endYmd = shanghaiTodayYmd()
    startYmd = addCalendarDaysShanghai(endYmd, -(days - 1))
  }

  const bearer = parseBearer(req)
  const warnings: string[] = []
  const rows: Record<string, unknown>[] = []

  if (!bearer) {
    warnings.push('缺少 Authorization: Bearer，无法拉取抖音来客对账；请在商家后台完成抖音来客绑定后刷新。')
  } else {
    const dy = await fetchDouyinFinanceReconcileRows(bearer, startYmd, endYmd)
    for (const w of dy.warnings) warnings.push(w)
    for (const r of dy.rows) {
      rows.push({
        date: r.date,
        platform: r.platform,
        platformLabel: r.platformLabel,
        orderCount: r.orderCount,
        verifyOrderCount: r.verifyOrderCount,
        salesAmountYuan: r.salesAmountYuan,
        verifyAmountYuan: r.verifyAmountYuan,
      })
    }
    warnings.push('美团、小红书财务对账行待网关接入对应开放平台 API 后与本接口聚合。')
  }

  json(res, 200, {
    ok: true,
    rows,
    startDate: startYmd,
    endDate: endYmd,
    fetchedAt: new Date().toISOString(),
    warnings,
  })
}
