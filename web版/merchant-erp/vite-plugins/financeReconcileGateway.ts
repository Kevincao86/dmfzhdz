/**
 * GET /api/merchant/finance/reconcile
 * 聚合各平台对账数据：抖音来客、美团走开放平台（或演示数据）；小红书待接。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchDouyinFinanceReconcileRows } from './douyinMerchantGateway.js'
import { fetchKuaishouFinanceReconcileRows } from './kuaishouMerchantGateway.js'
import { fetchMeituanFinanceReconcileRows } from './meituanMerchantGateway.js'
import { decodeMeituanSessionToken } from './meituanOpenApiCore.js'
import { decodeXhsSessionToken } from './xhsOpenApiCore.js'
import { fetchXhsFinanceReconcileRows } from './xhsMerchantGateway.js'
import {
  decodeWaimaiBearer,
  fetchWaimaiFinanceReconcileRows,
  type WaimaiPlatformKey,
} from './waimaiMerchantGateway.js'

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
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

function resolvePlatformTokens(req: IncomingMessage): {
  douyin?: string
  kuaishou?: string
  meituan?: string
  xhs?: string
  eleme?: string
  meituan_waimai?: string
  jd_waimai?: string
} {
  const auth = parseBearer(req)
  let douyin = headerToken(req, 'x-meoo-douyin-token')
  let kuaishou = headerToken(req, 'x-meoo-kuaishou-token')
  let meituan = headerToken(req, 'x-meoo-meituan-token')
  let xhs = headerToken(req, 'x-meoo-xhs-token')
  let eleme = headerToken(req, 'x-meoo-eleme-token')
  let meituan_waimai = headerToken(req, 'x-meoo-meituan-waimai-token')
  let jd_waimai = headerToken(req, 'x-meoo-jd-waimai-token')

  if (auth) {
    if (decodeMeituanSessionToken(auth)) meituan = meituan || auth
    else if (decodeXhsSessionToken(auth)) xhs = xhs || auth
    else if (decodeWaimaiBearer('eleme', auth)) eleme = eleme || auth
    else if (decodeWaimaiBearer('meituan_waimai', auth)) meituan_waimai = meituan_waimai || auth
    else if (decodeWaimaiBearer('jd_waimai', auth)) jd_waimai = jd_waimai || auth
    else if (kuaishou) kuaishou = kuaishou || auth
    else douyin = douyin || auth
  }
  return { douyin, kuaishou, meituan, xhs, eleme, meituan_waimai, jd_waimai }
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

  const {
    douyin: douyinToken,
    kuaishou: kuaishouToken,
    meituan: meituanToken,
    xhs: xhsToken,
    eleme: elemeToken,
    meituan_waimai: meituanWaimaiToken,
    jd_waimai: jdWaimaiToken,
  } = resolvePlatformTokens(req)
  const warnings: string[] = []
  const rows: Record<string, unknown>[] = []

  type PlatformPack = { rows: Record<string, unknown>[]; warnings: string[] }

  const jobs: Promise<PlatformPack>[] = []

  if (douyinToken) {
    jobs.push(
      (async () => {
        const dy = await fetchDouyinFinanceReconcileRows(douyinToken, startYmd, endYmd)
        return {
          warnings: dy.warnings,
          rows: dy.rows.map((r) => ({
            date: r.date,
            platform: r.platform,
            platformLabel: r.platformLabel,
            channel: 'groupbuy',
            orderCount: r.orderCount,
            verifyOrderCount: r.verifyOrderCount,
            salesAmountYuan: r.salesAmountYuan,
            verifyAmountYuan: r.verifyAmountYuan,
          })),
        }
      })(),
    )
  } else {
    warnings.push('未绑定抖音来客，跳过抖音对账。')
  }

  if (kuaishouToken) {
    jobs.push(
      (async () => {
        const ks = await fetchKuaishouFinanceReconcileRows(kuaishouToken, startYmd, endYmd)
        return {
          warnings: ks.warnings,
          rows: ks.rows.map((r) => ({
            date: r.date,
            platform: r.platform,
            platformLabel: r.platformLabel,
            channel: 'groupbuy',
            orderCount: r.orderCount,
            verifyOrderCount: r.verifyOrderCount,
            salesAmountYuan: r.salesAmountYuan,
            verifyAmountYuan: r.verifyAmountYuan,
          })),
        }
      })(),
    )
  } else {
    warnings.push('未绑定快手团购，跳过快手对账。')
  }

  if (meituanToken) {
    jobs.push(
      (async () => {
        const mt = await fetchMeituanFinanceReconcileRows(meituanToken, startYmd, endYmd)
        return {
          warnings: mt.warnings,
          rows: mt.rows.map((r) => ({
            date: r.date,
            platform: r.platform,
            platformLabel: r.platformLabel,
            channel: 'groupbuy',
            orderCount: r.orderCount,
            verifyOrderCount: r.verifyOrderCount,
            salesAmountYuan: r.salesAmountYuan,
            verifyAmountYuan: r.verifyAmountYuan,
          })),
        }
      })(),
    )
  } else {
    warnings.push('未绑定美团点评，跳过美团对账。')
  }

  if (xhsToken) {
    jobs.push(
      (async () => {
        const xh = await fetchXhsFinanceReconcileRows(xhsToken, startYmd, endYmd)
        return {
          warnings: xh.warnings,
          rows: xh.rows.map((r) => ({
            date: r.date,
            platform: r.platform,
            platformLabel: r.platformLabel,
            channel: 'groupbuy',
            orderCount: r.orderCount,
            verifyOrderCount: r.verifyOrderCount,
            salesAmountYuan: r.salesAmountYuan,
            verifyAmountYuan: r.verifyAmountYuan,
          })),
        }
      })(),
    )
  } else {
    warnings.push('未绑定小红书商家后台，跳过小红书对账。')
  }

  const waimaiPlatforms: { key: WaimaiPlatformKey; token?: string; label: string }[] = [
    { key: 'eleme', token: elemeToken, label: '淘宝闪购' },
    { key: 'meituan_waimai', token: meituanWaimaiToken, label: '美团外卖' },
    { key: 'jd_waimai', token: jdWaimaiToken, label: '京东外卖' },
  ]
  for (const wp of waimaiPlatforms) {
    if (wp.token) {
      jobs.push(
        (async () => {
          const wm = await fetchWaimaiFinanceReconcileRows(wp.key, wp.token!, startYmd, endYmd)
          return {
            warnings: wm.warnings,
            rows: wm.rows.map((r) => ({
              date: r.date,
              platform: r.platform,
              platformLabel: r.platformLabel,
              channel: 'waimai',
              orderCount: r.orderCount,
              verifyOrderCount: r.verifyOrderCount,
              salesAmountYuan: r.salesAmountYuan,
              verifyAmountYuan: r.verifyAmountYuan,
            })),
          }
        })(),
      )
    } else {
      warnings.push(`未绑定${wp.label}，跳过${wp.label}对账。`)
    }
  }

  const packs = await Promise.all(jobs)
  for (const pack of packs) {
    warnings.push(...pack.warnings)
    rows.push(...pack.rows)
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
