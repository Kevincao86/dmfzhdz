import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import { readMerchantSession } from '../lib/merchantSession'
import { supabase } from '../lib/supabaseClient'
import { readStorePlatformMargins } from '../lib/storeMarginsRead'

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
  stores: ShopStoreOption[]
  topBySales: { name: string; productId: string; salesYuan: number; couponCount: number; share: number }[]
  topByRefund: { name: string; productId: string; refundYuan: number; refundRate: number }[]
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
      last = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(last)
}

export async function syncMerchantOrders(params: {
  startDate: string
  endDate: string
}): Promise<{ pulled: number; upserted: number; warnings: string[] }> {
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const j = await fetchJson('/api/meoo-merchant-orders-sync', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  })
  return {
    pulled: Number(j.pulled) || 0,
    upserted: Number(j.upserted) || 0,
    warnings: Array.isArray(j.warnings) ? (j.warnings as string[]) : [],
  }
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
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    platform: params.platform || 'douyin',
    marginPercent: String(margins.douyin || 0),
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
