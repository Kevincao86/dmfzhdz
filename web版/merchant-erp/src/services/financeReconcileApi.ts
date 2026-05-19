/**
 * 各平台财务对账台数据（订单、核销、金额等）。
 * 本地：`GET /api/merchant/finance/reconcile`；生产由网关聚合各开放平台对账/订单接口。
 */

import { readMerchantSession } from '../lib/merchantSession'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

export type FinancePlatformId = 'douyin' | 'meituan' | 'xhs'

export type FinanceReconcileRow = {
  date: string
  platform: FinancePlatformId
  platformLabel: string
  orderCount: number
  verifyOrderCount: number
  /** 售卖口径金额（下单/成交额等，由平台定义） */
  salesAmountYuan: number
  /** 核销口径金额 */
  verifyAmountYuan: number
}

export type FinanceReconcileResult =
  | {
      ok: true
      rows: FinanceReconcileRow[]
      fetchedAt: string
      warnings?: string[]
      startDate?: string
      endDate?: string
    }
  | { ok: false; message: string }

export async function fetchFinanceReconcile(params?: {
  days?: number
  /** 与 endDate 同时传入时优先于 days，格式 YYYY-MM-DD（上海日历日，与网关一致） */
  startDate?: string
  endDate?: string
  signal?: AbortSignal
}): Promise<FinanceReconcileResult> {
  const q = new URLSearchParams()
  const start = (params?.startDate ?? '').trim()
  const end = (params?.endDate ?? '').trim()
  if (start && end) {
    q.set('startDate', start)
    q.set('endDate', end)
  } else {
    const days = Math.min(90, Math.max(1, params?.days ?? 14))
    q.set('days', String(days))
  }
  const douyinToken = readMerchantSession('meoo_douyin_merchant_token')
  const meituanToken = readMerchantSession('meoo_meituan_merchant_token')
  const xhsToken = readMerchantSession('meoo_xhs_merchant_token')
  const primary = douyinToken ?? meituanToken ?? xhsToken
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (primary) headers.Authorization = `Bearer ${primary}`
  if (douyinToken) headers['X-Meoo-Douyin-Token'] = douyinToken
  if (meituanToken) headers['X-Meoo-Meituan-Token'] = meituanToken
  if (xhsToken) headers['X-Meoo-Xhs-Token'] = xhsToken

  try {
    const res = await fetch(url(`/api/merchant/finance/reconcile?${q}`), {
      method: 'GET',
      headers,
      signal: params?.signal,
    })
    let data: Record<string, unknown> = {}
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const msg =
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        `HTTP ${res.status}`
      return { ok: false, message: msg }
    }
    if (data.ok === false) {
      return { ok: false, message: typeof data.message === 'string' ? data.message : '对账接口返回失败' }
    }
    const rawRows = data.rows ?? data.data
    const rows: FinanceReconcileRow[] = []
    if (Array.isArray(rawRows)) {
      for (const row of rawRows) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        const platform = String(r.platform ?? 'douyin').toLowerCase()
        if (platform !== 'douyin' && platform !== 'meituan' && platform !== 'xhs') continue
        rows.push({
          date: String(r.date ?? '').slice(0, 10),
          platform: platform as FinancePlatformId,
          platformLabel: String(r.platformLabel ?? r.platform_label ?? ''),
          orderCount: Math.max(0, Math.round(Number(r.orderCount ?? r.order_count ?? 0))),
          verifyOrderCount: Math.max(0, Math.round(Number(r.verifyOrderCount ?? r.verify_order_count ?? 0))),
          salesAmountYuan: Math.max(0, Number(r.salesAmountYuan ?? r.sales_amount_yuan ?? 0)),
          verifyAmountYuan: Math.max(0, Number(r.verifyAmountYuan ?? r.verify_amount_yuan ?? 0)),
        })
      }
    }
    const fetchedAt =
      typeof data.fetchedAt === 'string'
        ? data.fetchedAt
        : typeof data.fetched_at === 'string'
          ? data.fetched_at
          : new Date().toISOString()
    const warningsRaw = data.warnings
    const warnings = Array.isArray(warningsRaw)
      ? warningsRaw.filter((x): x is string => typeof x === 'string')
      : undefined
    const startDate = typeof data.startDate === 'string' ? data.startDate : undefined
    const endDate = typeof data.endDate === 'string' ? data.endDate : undefined
    return { ok: true, rows, fetchedAt, warnings, startDate, endDate }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, message: '请求已取消' }
    }
    return { ok: false, message: e instanceof Error ? e.message : '网络错误' }
  }
}
