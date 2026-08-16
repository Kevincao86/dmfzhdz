/**
 * GET /api/merchant/finance/commission-rates
 * 各已绑定平台：用开放平台账单/分账接口实算佣金率，禁止本地行业表兜底。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchDouyinPlatformCommissionRate } from './douyinMerchantGateway.js'
import {
  decodeMeituanSessionToken,
  meituanPathFromEnv,
  meituanSignedRequest,
  pickArrayFromMeituanPayload,
} from './meituanOpenApiCore.js'
import {
  decodeXhsSessionToken,
  pickArrayFromXhsPayload,
  xhsPathFromEnv,
  xhsSignedRequest,
} from './xhsOpenApiCore.js'
import {
  decodeWaimaiSessionToken,
  pickArrayFromWaimaiPayload,
  type WaimaiPlatformKey,
  waimaiConfiguredForLiveApi,
  waimaiPathFromEnv,
  waimaiSignedRequest,
} from './waimaiOpenApiCore.js'

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
  return m?.[1]?.trim() || v.trim() || undefined
}

function resolvePlatformTokens(req: IncomingMessage): {
  douyin?: string
  meituan?: string
  xhs?: string
  eleme?: string
  meituan_waimai?: string
  jd_waimai?: string
} {
  const auth = parseBearer(req)
  let douyin = headerToken(req, 'x-meoo-douyin-token')
  let meituan = headerToken(req, 'x-meoo-meituan-token')
  let xhs = headerToken(req, 'x-meoo-xhs-token')
  let eleme = headerToken(req, 'x-meoo-eleme-token')
  let meituan_waimai = headerToken(req, 'x-meoo-meituan-waimai-token')
  let jd_waimai = headerToken(req, 'x-meoo-jd-waimai-token')

  if (auth) {
    if (decodeMeituanSessionToken(auth)) meituan = meituan || auth
    else if (decodeXhsSessionToken(auth)) xhs = xhs || auth
    else if (decodeWaimaiSessionToken('eleme', auth)) eleme = eleme || auth
    else if (decodeWaimaiSessionToken('meituan_waimai', auth)) meituan_waimai = meituan_waimai || auth
    else if (decodeWaimaiSessionToken('jd_waimai', auth)) jd_waimai = jd_waimai || auth
    else douyin = douyin || auth
  }
  return { douyin, meituan, xhs, eleme, meituan_waimai, jd_waimai }
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

export type FinanceCommissionRateRow = {
  platformId: string
  ok: boolean
  bound: boolean
  ratePct: number
  feeYuan: number
  baseYuan: number
  source: string
  sampleCount?: number
  apiPath?: string
  error?: string
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(/%/g, '').trim())
    if (Number.isFinite(n)) return n
  }
  return null
}

function normalizeRatePct(n: number): number | null {
  if (n > 0 && n < 1) return Math.round(n * 1000) / 10
  if (n >= 1 && n <= 40) return Math.round(n * 10) / 10
  if (n > 40 && n <= 4000) return Math.round(n) / 100
  return null
}

const BILL_RATE_KEYS = [
  'commission_rate',
  'commissionRate',
  'service_fee_rate',
  'platform_commission_rate',
  'tech_service_rate',
  'software_service_rate',
  'fee_rate',
  'settle_rate',
]

const BILL_FEE_KEYS = [
  'total_merchant_platform_service',
  'platform_commission',
  'platformCommission',
  'commission_amount',
  'commissionAmount',
  'service_fee',
  'serviceFee',
  'software_service_fee',
  'tech_service_fee',
  'commission',
]

const BILL_BASE_KEYS = [
  'verify_amount',
  'verifyAmountYuan',
  'verify_amount_yuan',
  'ledger_total',
  'sales_amount',
  'salesAmountYuan',
  'settle_amount',
  'original',
]

function pickFromRecord(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const n = num(o[k])
    if (n != null && n !== 0) return n
  }
  return null
}

function maybeFenToYuan(n: number): number {
  if (n >= 1000 && Number.isInteger(n)) return n / 100
  return n
}

function aggregateBillCommission(bills: unknown[]): {
  ratePct: number
  feeYuan: number
  baseYuan: number
  sampleCount: number
} | null {
  let feeYuan = 0
  let baseYuan = 0
  let rateSum = 0
  let rateN = 0
  let sampleCount = 0
  for (const b of bills) {
    if (!b || typeof b !== 'object') continue
    const o = b as Record<string, unknown>
    const rateRaw = pickFromRecord(o, BILL_RATE_KEYS)
    const feeRaw = pickFromRecord(o, BILL_FEE_KEYS)
    const baseRaw = pickFromRecord(o, BILL_BASE_KEYS)
    if (rateRaw != null) {
      const pct = normalizeRatePct(rateRaw)
      if (pct != null) {
        rateSum += pct
        rateN += 1
      }
    }
    if (feeRaw != null) {
      feeYuan += maybeFenToYuan(feeRaw)
      sampleCount += 1
    }
    if (baseRaw != null) {
      baseYuan += maybeFenToYuan(baseRaw)
    }
  }
  if (rateN > 0) {
    return {
      ratePct: Math.round((rateSum / rateN) * 10) / 10,
      feeYuan: Math.round(feeYuan * 100) / 100,
      baseYuan: Math.round(baseYuan * 100) / 100,
      sampleCount: rateN,
    }
  }
  if (feeYuan > 0 && baseYuan > 0) {
    return {
      ratePct: Math.min(40, Math.max(0, Math.round((feeYuan / baseYuan) * 1000) / 10)),
      feeYuan: Math.round(feeYuan * 100) / 100,
      baseYuan: Math.round(baseYuan * 100) / 100,
      sampleCount,
    }
  }
  return null
}

function unboundRow(platformId: string, error: string): FinanceCommissionRateRow {
  return {
    platformId,
    ok: false,
    bound: false,
    ratePct: 0,
    feeYuan: 0,
    baseYuan: 0,
    source: 'unbound',
    error,
  }
}

async function fetchMeituanCommissionRate(
  bearer: string,
  startYmd: string,
  endYmd: string,
): Promise<FinanceCommissionRateRow> {
  const session = decodeMeituanSessionToken(bearer.trim())
  if (!session) {
    return unboundRow('meituan', '美团会话无效')
  }
  if (session.demo) {
    return {
      platformId: 'meituan',
      ok: false,
      bound: true,
      ratePct: 0,
      feeYuan: 0,
      baseYuan: 0,
      source: 'api_error',
      error: '美团为演示会话，未调用真实佣金接口',
    }
  }
  const path = meituanPathFromEnv('MEITUAN_COMMISSION_PATH', meituanPathFromEnv('MEITUAN_FINANCE_PATH', '/bill/daily/summary'))
  const r = await meituanSignedRequest(session, path, {
    method: 'POST',
    body: { start_date: startYmd, end_date: endYmd, merchant_id: session.merchantId },
  })
  if (!r.ok) {
    return {
      platformId: 'meituan',
      ok: false,
      bound: true,
      ratePct: 0,
      feeYuan: 0,
      baseYuan: 0,
      source: 'api_error',
      apiPath: path,
      error: r.message || '美团佣金接口调用失败',
    }
  }
  const bills = pickArrayFromMeituanPayload(r.json, ['bills', 'rows', 'list', 'daily', 'items'])
  const agg = aggregateBillCommission(bills)
  if (!agg) {
    return {
      platformId: 'meituan',
      ok: false,
      bound: true,
      ratePct: 0,
      feeYuan: 0,
      baseYuan: 0,
      source: 'api_empty',
      apiPath: path,
      error: '美团账单未返回佣金率或软件服务费字段',
    }
  }
  return {
    platformId: 'meituan',
    ok: true,
    bound: true,
    ratePct: agg.ratePct,
    feeYuan: agg.feeYuan,
    baseYuan: agg.baseYuan,
    sampleCount: agg.sampleCount,
    source: 'meituan:bill',
    apiPath: path,
  }
}

async function fetchXhsCommissionRate(
  bearer: string,
  startYmd: string,
  endYmd: string,
): Promise<FinanceCommissionRateRow> {
  const session = decodeXhsSessionToken(bearer.trim())
  if (!session) {
    return unboundRow('xhs', '小红书会话无效')
  }
  if (session.demo) {
    return {
      platformId: 'xhs',
      ok: false,
      bound: true,
      ratePct: 0,
      feeYuan: 0,
      baseYuan: 0,
      source: 'api_error',
      error: '小红书为演示会话，未调用真实佣金接口',
    }
  }
  const path = xhsPathFromEnv('XHS_COMMISSION_PATH', xhsPathFromEnv('XHS_FINANCE_PATH', '/bill/daily/summary'))
  const r = await xhsSignedRequest(session, path, {
    method: 'POST',
    body: { start_date: startYmd, end_date: endYmd, merchant_id: session.merchantId },
  })
  if (!r.ok) {
    return {
      platformId: 'xhs',
      ok: false,
      bound: true,
      ratePct: 0,
      feeYuan: 0,
      baseYuan: 0,
      source: 'api_error',
      apiPath: path,
      error: r.message || '小红书佣金接口调用失败',
    }
  }
  const bills = pickArrayFromXhsPayload(r.json, ['bills', 'rows', 'list', 'daily', 'items'])
  const agg = aggregateBillCommission(bills)
  if (!agg) {
    return {
      platformId: 'xhs',
      ok: false,
      bound: true,
      ratePct: 0,
      feeYuan: 0,
      baseYuan: 0,
      source: 'api_empty',
      apiPath: path,
      error: '小红书账单未返回佣金率或软件服务费字段',
    }
  }
  return {
    platformId: 'xhs',
    ok: true,
    bound: true,
    ratePct: agg.ratePct,
    feeYuan: agg.feeYuan,
    baseYuan: agg.baseYuan,
    sampleCount: agg.sampleCount,
    source: 'xhs:bill',
    apiPath: path,
  }
}

const WAIMAI_COMMISSION_ENV: Record<WaimaiPlatformKey, { pathEnv: string; label: string }> = {
  eleme: { pathEnv: 'ELEME_COMMISSION_PATH', label: '淘宝闪购' },
  meituan_waimai: { pathEnv: 'MEITUAN_WAIMAI_COMMISSION_PATH', label: '美团外卖' },
  jd_waimai: { pathEnv: 'JD_WAIMAI_COMMISSION_PATH', label: '京东外卖' },
}

const WAIMAI_FINANCE_ENV: Record<WaimaiPlatformKey, string> = {
  eleme: 'ELEME_FINANCE_PATH',
  meituan_waimai: 'MEITUAN_WAIMAI_FINANCE_PATH',
  jd_waimai: 'JD_WAIMAI_FINANCE_PATH',
}

async function fetchWaimaiCommissionRate(
  platform: WaimaiPlatformKey,
  bearer: string,
  startYmd: string,
  endYmd: string,
): Promise<FinanceCommissionRateRow> {
  const meta = WAIMAI_COMMISSION_ENV[platform]
  const session = decodeWaimaiSessionToken(platform, bearer.trim())
  if (!session) {
    return unboundRow(platform, `${meta.label}会话无效`)
  }
  if (session.demo || !waimaiConfiguredForLiveApi(platform)) {
    return {
      platformId: platform,
      ok: false,
      bound: true,
      ratePct: 0,
      feeYuan: 0,
      baseYuan: 0,
      source: 'api_error',
      error: `${meta.label}未配置 OpenAPI，无法拉取佣金率`,
    }
  }
  const path = waimaiPathFromEnv(
    platform,
    meta.pathEnv,
    waimaiPathFromEnv(platform, WAIMAI_FINANCE_ENV[platform], '/bill/daily/summary'),
  )
  const r = await waimaiSignedRequest(session, path, {
    method: 'POST',
    body: { start_date: startYmd, end_date: endYmd, merchant_id: session.merchantId },
  })
  if (!r.ok) {
    return {
      platformId: platform,
      ok: false,
      bound: true,
      ratePct: 0,
      feeYuan: 0,
      baseYuan: 0,
      source: 'api_error',
      apiPath: path,
      error: r.message || `${meta.label}佣金接口调用失败`,
    }
  }
  const bills = pickArrayFromWaimaiPayload(r.json, ['bills', 'rows', 'list', 'daily', 'items'])
  const agg = aggregateBillCommission(bills)
  if (!agg) {
    return {
      platformId: platform,
      ok: false,
      bound: true,
      ratePct: 0,
      feeYuan: 0,
      baseYuan: 0,
      source: 'api_empty',
      apiPath: path,
      error: `${meta.label}账单未返回佣金率或软件服务费字段`,
    }
  }
  return {
    platformId: platform,
    ok: true,
    bound: true,
    ratePct: agg.ratePct,
    feeYuan: agg.feeYuan,
    baseYuan: agg.baseYuan,
    sampleCount: agg.sampleCount,
    source: `${platform}:bill`,
    apiPath: path,
  }
}

export async function handleFinanceCommissionRatesGet(
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

  const tokens = resolvePlatformTokens(req)
  const warnings: string[] = []
  const jobs: Promise<FinanceCommissionRateRow>[] = []

  if (tokens.douyin) {
    jobs.push(
      fetchDouyinPlatformCommissionRate(tokens.douyin, startYmd, endYmd).then((r) => ({
        platformId: 'douyin',
        ok: r.ok,
        bound: r.bound,
        ratePct: r.ratePct,
        feeYuan: r.feeYuan,
        baseYuan: r.baseYuan,
        sampleCount: r.sampleCount,
        source: r.source,
        apiPath: r.apiPath,
        error: r.error,
      })),
    )
  } else {
    jobs.push(Promise.resolve(unboundRow('douyin', '未绑定抖音来客')))
  }

  if (tokens.meituan) {
    jobs.push(fetchMeituanCommissionRate(tokens.meituan, startYmd, endYmd))
  } else {
    jobs.push(Promise.resolve(unboundRow('meituan', '未绑定美团点评')))
  }

  if (tokens.xhs) {
    jobs.push(fetchXhsCommissionRate(tokens.xhs, startYmd, endYmd))
  } else {
    jobs.push(Promise.resolve(unboundRow('xhs', '未绑定小红书')))
  }

  const waimai: { key: WaimaiPlatformKey; token?: string }[] = [
    { key: 'eleme', token: tokens.eleme },
    { key: 'meituan_waimai', token: tokens.meituan_waimai },
    { key: 'jd_waimai', token: tokens.jd_waimai },
  ]
  for (const w of waimai) {
    if (w.token) jobs.push(fetchWaimaiCommissionRate(w.key, w.token, startYmd, endYmd))
    else jobs.push(Promise.resolve(unboundRow(w.key, `未绑定${WAIMAI_COMMISSION_ENV[w.key].label}`)))
  }

  const rates = await Promise.all(jobs)
  for (const r of rates) {
    if (r.error) warnings.push(`${r.platformId}：${r.error}`)
  }

  json(res, 200, {
    ok: true,
    rates,
    startDate: startYmd,
    endDate: endYmd,
    fetchedAt: new Date().toISOString(),
    warnings,
  })
}
