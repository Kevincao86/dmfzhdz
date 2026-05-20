/**
 * 各平台财务对账台数据（订单、核销、金额等）。
 * 生产优先 `GET /api/meoo-finance-reconcile`，回退 `/api/merchant/finance/reconcile`。
 */

import {
  financePlatformChannel,
  type FinancePlatformId,
} from '../constants/merchantPlatforms'
import { readMerchantSession } from '../lib/merchantSession'
import { isLikelyRouteMiss404, merchantApiFetchUrlCandidates } from './douyinProductApi'

export type { FinancePlatformId }

export type FinanceReconcileRow = {
  date: string
  platform: FinancePlatformId
  platformLabel: string
  /** 团购 / 外卖，用于财务页筛选 */
  channel?: 'groupbuy' | 'waimai'
  orderCount: number
  verifyOrderCount: number
  salesAmountYuan: number
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

function responseLooksLikeHtml(text: string, contentType: string): boolean {
  const t = text.trimStart()
  return t.startsWith('<') || /text\/html/i.test(contentType)
}

export async function fetchFinanceReconcile(params?: {
  days?: number
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
  const elemeToken = readMerchantSession('meoo_eleme_merchant_token')
  const meituanWaimaiToken = readMerchantSession('meoo_meituan_waimai_merchant_token')
  const jdWaimaiToken = readMerchantSession('meoo_jd_waimai_merchant_token')
  const primary =
    douyinToken ??
    meituanToken ??
    xhsToken ??
    elemeToken ??
    meituanWaimaiToken ??
    jdWaimaiToken
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (primary) headers.Authorization = `Bearer ${primary}`
  if (douyinToken) headers['X-Meoo-Douyin-Token'] = douyinToken
  if (meituanToken) headers['X-Meoo-Meituan-Token'] = meituanToken
  if (xhsToken) headers['X-Meoo-Xhs-Token'] = xhsToken
  if (elemeToken) headers['X-Meoo-Eleme-Token'] = elemeToken
  if (meituanWaimaiToken) headers['X-Meoo-Meituan-Waimai-Token'] = meituanWaimaiToken
  if (jdWaimaiToken) headers['X-Meoo-Jd-Waimai-Token'] = jdWaimaiToken

  const qs = `?${q}`
  const paths = [`/api/meoo-finance-reconcile${qs}`, `/api/merchant/finance/reconcile${qs}`]
  const targets = merchantApiFetchUrlCandidates(paths)

  try {
    let res: Response | null = null
    let bodyText = ''
    for (const target of targets) {
      const r = await fetch(target, {
        method: 'GET',
        headers,
        signal: params?.signal,
      })
      bodyText = await r.text()
      if (
        r.status === 404 &&
        isLikelyRouteMiss404(r, bodyText.trim(), r.headers.get('content-type') ?? '')
      ) {
        continue
      }
      res = r
      break
    }
    if (!res) {
      return { ok: false, message: '财务对账接口未部署' }
    }
    if (responseLooksLikeHtml(bodyText, res.headers.get('content-type') ?? '')) {
      return { ok: false, message: '财务对账接口返回了 HTML 页面，请检查部署路由。' }
    }
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(bodyText) as Record<string, unknown>
    } catch {
      return { ok: false, message: '财务对账响应非 JSON' }
    }
    if (!res.ok) {
      return {
        ok: false,
        message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
      }
    }
    const rowsRaw = data.rows
    const rows: FinanceReconcileRow[] = Array.isArray(rowsRaw)
      ? rowsRaw.map((row) => {
          const r = row as Record<string, unknown>
          const platform = String(r.platform ?? '') as FinancePlatformId
          return {
            date: String(r.date ?? ''),
            platform,
            platformLabel: String(r.platformLabel ?? r.platform ?? ''),
            channel:
              r.channel === 'waimai' || r.channel === 'groupbuy'
                ? r.channel
                : financePlatformChannel(platform),
            orderCount: Number(r.orderCount ?? 0),
            verifyOrderCount: Number(r.verifyOrderCount ?? 0),
            salesAmountYuan: Number(r.salesAmountYuan ?? 0),
            verifyAmountYuan: Number(r.verifyAmountYuan ?? 0),
          }
        })
      : []
    return {
      ok: true,
      rows,
      fetchedAt: String(data.fetchedAt ?? new Date().toISOString()),
      warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : undefined,
      startDate: typeof data.startDate === 'string' ? data.startDate : undefined,
      endDate: typeof data.endDate === 'string' ? data.endDate : undefined,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg }
  }
}
