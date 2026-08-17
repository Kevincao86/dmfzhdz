import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import { readMerchantSession } from '../lib/merchantSession'
import { supabase } from '../lib/supabaseClient'
import {
  marginPercentForFinancePlatform,
  readStorePlatformMargins,
  type StorePlatformMargins,
} from '../lib/storeMarginsRead'

function shopAnalysisMarginPercent(
  margins: StorePlatformMargins,
  platform?: string,
): number {
  const p = String(platform || 'douyin').trim()
  if (p === 'meituan') return marginPercentForFinancePlatform(margins, 'meituan')
  if (p === 'xhs' || p === 'xiaohongshu') return marginPercentForFinancePlatform(margins, 'xhs')
  return marginPercentForFinancePlatform(margins, 'douyin')
}

export type MerchantOrderRow = {
  id: string
  tenantId: string
  platform: string
  orderId: string
  skuId: string
  skuName: string
  productId: string
  categoryL1: string
  categoryL2: string
  categoryL3: string
  payAmountFen: number
  refundAmountFen: number
  couponCount: number
  orderStatus: number | null
  payTime: string | null
  verifyTime: string | null
  openId: string
  syncedAt: string
}

export type ShopStoreOption = { poiId: string; poiName: string; orderCount: number }

export type ShopAnalysisSummary = {
  orderCount: number
  couponCount: number
  salesAmountYuan: number
  refundAmountYuan: number
  refundRate: number
  buyerCount: number
  openIdCoverage: number
  newBuyerCount: number
  oldBuyerCount: number
  newBuyerSalesYuan: number
  oldBuyerSalesYuan: number
  newBuyerShare: number
  oneTimeBuyerCount: number
  repeatBuyerCount: number
  repurchaseRate: number
  estimatedGrossYuan: number
  hasPreWindowHistory: boolean
  guestBasis: 'history' | 'repurchase'
  stores: ShopStoreOption[]
  topBySales: { name: string; productId: string; salesYuan: number; couponCount: number; share: number }[]
  topByRefund: { name: string; productId: string; refundYuan: number; refundRate: number }[]
  mom?: ShopPeriodKpis
  yoy?: ShopPeriodKpis
  coverageGapDays?: string[]
}

export type ShopPeriodKpis = {
  startDate: string
  endDate: string
  salesAmountYuan: number
  orderCount: number
  refundRate: number
  repurchaseRate: number
  newBuyerShare: number
}

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const h: Record<string, string> = { Accept: 'application/json', ...(extra || {}) }
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const t = data.session?.access_token
    if (t) h.Authorization = `Bearer ${t}`
  }
  const douyinToken = readMerchantSession('meoo_douyin_merchant_token')
  if (douyinToken) h['X-Meoo-Douyin-Token'] = douyinToken
  return h
}

async function fetchJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let last = '接口不可用'
  for (const url of merchantErpApiCandidates(path)) {
    try {
      const res = await fetch(url, init)
      const text = await res.text()
      let j: Record<string, unknown>
      try {
        j = JSON.parse(text) as Record<string, unknown>
      } catch {
        last = `非 JSON HTTP ${res.status}`
        continue
      }
      if (!res.ok || j.ok === false) {
        last = String(j.detail || j.message || j.error || `HTTP ${res.status}`)
        continue
      }
      return j
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      if (e instanceof Error && e.name === 'AbortError') throw e
      last = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(last)
}

function addCalendarDaysYmd(ymd: string, delta: number): string {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + delta * 86_400_000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

/** 浏览器一次只同步 3 天，避免整月/整周请求被网关断开后留下空洞 */
export function eachShopSyncWeekChunks(startYmd: string, endYmd: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = []
  let cur = startYmd
  let guard = 0
  while (cur <= endYmd && guard++ < 80) {
    const chunkEnd = addCalendarDaysYmd(cur, 2)
    const end = chunkEnd > endYmd ? endYmd : chunkEnd
    out.push({ start: cur, end })
    if (end >= endYmd) break
    cur = addCalendarDaysYmd(end, 1)
  }
  return out
}

function abortAfter(ms: number): AbortSignal {
  const c = new AbortController()
  window.setTimeout(() => c.abort(), ms)
  return c.signal
}

export async function syncMerchantOrders(params: {
  startDate: string
  endDate: string
  onProgress?: (done: number, total: number) => void
}): Promise<{ pulled: number; upserted: number; warnings: string[] }> {
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const weeks = eachShopSyncWeekChunks(params.startDate, params.endDate)
  let pulled = 0
  let upserted = 0
  const warnings: string[] = []
  let lastErr = ''
  const syncOne = async (week: { start: string; end: string }) => {
    const j = await fetchJson('/api/meoo-merchant-orders-sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({ startDate: week.start, endDate: week.end }),
      signal: abortAfter(180_000),
    })
    pulled += Number(j.pulled) || 0
    upserted += Number(j.upserted) || 0
    if (Array.isArray(j.warnings)) {
      for (const w of j.warnings as string[]) {
        if (w && !warnings.includes(w)) warnings.push(w)
      }
    }
  }
  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i]
    params.onProgress?.(i + 1, weeks.length)
    try {
      await syncOne(week)
    } catch {
      try {
        await syncOne(week)
      } catch (e2) {
        lastErr =
          e2 instanceof Error
            ? e2.name === 'AbortError'
              ? `同步 ${week.start}~${week.end} 超时`
              : e2.message
            : String(e2)
        if (!warnings.includes(lastErr)) warnings.push(lastErr)
      }
    }
  }
  if (upserted <= 0 && lastErr) throw new Error(lastErr)
  return { pulled, upserted, warnings }
}

export async function listMerchantOrders(params: {
  platform?: string
  startDate?: string
  endDate?: string
  q?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: MerchantOrderRow[]; total: number }> {
  const q = new URLSearchParams()
  if (params.platform) q.set('platform', params.platform)
  if (params.startDate) q.set('startDate', params.startDate)
  if (params.endDate) q.set('endDate', params.endDate)
  if (params.q) q.set('q', params.q)
  if (params.page) q.set('page', String(params.page))
  if (params.pageSize) q.set('pageSize', String(params.pageSize))
  const headers = await authHeaders()
  const j = await fetchJson(`/api/meoo-merchant-orders?${q}`, { method: 'GET', headers })
  return {
    rows: Array.isArray(j.rows) ? (j.rows as MerchantOrderRow[]) : [],
    total: Number(j.total) || 0,
  }
}

export async function fetchShopAnalysis(params: {
  startDate: string
  endDate: string
  platform?: string
  poiId?: string
}): Promise<{ summary: ShopAnalysisSummary; adviceFacts: string; startDate: string; endDate: string }> {
  const margins = readStorePlatformMargins()
  const platform = params.platform || 'douyin'
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    platform,
    marginPercent: String(shopAnalysisMarginPercent(margins, platform) || 0),
  })
  if (params.poiId?.trim()) q.set('poiId', params.poiId.trim())
  const headers = await authHeaders()
  const j = await fetchJson(`/api/meoo-shop-analysis-summary?${q}`, { method: 'GET', headers })
  return {
    summary: j.summary as ShopAnalysisSummary,
    adviceFacts: String(j.adviceFacts || ''),
    startDate: String(j.startDate || params.startDate),
    endDate: String(j.endDate || params.endDate),
  }
}

export type ShopReviewDigest = {
  ok: boolean
  message?: string
  warning?: string
  total: number
  avgStars: number
  goodCount: number
  neutralCount: number
  badCount: number
  unrepliedCount: number
  goodShare: number
  badShare: number
  badSamples: { stars: number; text: string; poiName?: string }[]
}

export type ShopAiReportSection = { title: string; body: string; bullets: string[] }

export async function fetchShopAnalysisAi(params: {
  startDate: string
  endDate: string
  platform?: string
  poiId?: string
}): Promise<{
  summary: ShopAnalysisSummary
  adviceFacts: string
  reviewDigest: ShopReviewDigest
  aiReport: string
  aiSections: ShopAiReportSection[]
  modelUsed: string
  warnings: string[]
  aiFailed?: boolean
  message?: string
  pointsCharged?: number
}> {
  const margins = readStorePlatformMargins()
  const platform = params.platform || 'douyin'
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const j = await fetchJson('/api/meoo-shop-analysis-ai', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      startDate: params.startDate,
      endDate: params.endDate,
      platform,
      poiId: params.poiId || undefined,
      marginPercent: shopAnalysisMarginPercent(margins, platform) || 0,
    }),
  })
  return {
    summary: j.summary as ShopAnalysisSummary,
    adviceFacts: String(j.adviceFacts || ''),
    reviewDigest: (j.reviewDigest || {
      ok: false,
      total: 0,
      avgStars: 0,
      goodCount: 0,
      neutralCount: 0,
      badCount: 0,
      unrepliedCount: 0,
      goodShare: 0,
      badShare: 0,
      badSamples: [],
    }) as ShopReviewDigest,
    aiReport: String(j.aiReport || ''),
    aiSections: Array.isArray(j.aiSections) ? (j.aiSections as ShopAiReportSection[]) : [],
    modelUsed: String(j.modelUsed || ''),
    warnings: Array.isArray(j.warnings) ? (j.warnings as string[]) : [],
    aiFailed: Boolean(j.aiFailed),
    message: j.message ? String(j.message) : undefined,
    pointsCharged: Number(j.pointsCharged) || 0,
  }
}
