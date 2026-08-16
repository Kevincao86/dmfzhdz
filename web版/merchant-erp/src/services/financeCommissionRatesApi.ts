/**
 * 各平台佣金率：生产优先 GET /api/meoo-finance-commission-rates
 * 由开放平台账单接口实算，禁止本地行业表。
 */
import type { FinancePlatformId } from '../constants/merchantPlatforms'
import { readMerchantSession } from '../lib/merchantSession'
import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import { isLikelyRouteMiss404 } from './douyinProductApi'

export type FinanceCommissionRateRow = {
  platformId: FinancePlatformId | string
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

export type FinanceCommissionRatesResult =
  | {
      ok: true
      rates: FinanceCommissionRateRow[]
      warnings?: string[]
      startDate?: string
      endDate?: string
    }
  | { ok: false; message: string }

function responseLooksLikeHtml(text: string, contentType: string): boolean {
  const t = text.trimStart()
  return t.startsWith('<') || /text\/html/i.test(contentType)
}

export async function fetchFinanceCommissionRates(params?: {
  days?: number
  startDate?: string
  endDate?: string
  signal?: AbortSignal
}): Promise<FinanceCommissionRatesResult> {
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
    douyinToken ?? meituanToken ?? xhsToken ?? elemeToken ?? meituanWaimaiToken ?? jdWaimaiToken
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (primary) headers.Authorization = `Bearer ${primary}`
  if (douyinToken) headers['X-Meoo-Douyin-Token'] = douyinToken
  if (meituanToken) headers['X-Meoo-Meituan-Token'] = meituanToken
  if (xhsToken) headers['X-Meoo-Xhs-Token'] = xhsToken
  if (elemeToken) headers['X-Meoo-Eleme-Token'] = elemeToken
  if (meituanWaimaiToken) headers['X-Meoo-Meituan-Waimai-Token'] = meituanWaimaiToken
  if (jdWaimaiToken) headers['X-Meoo-Jd-Waimai-Token'] = jdWaimaiToken

  const qs = `?${q}`
  const paths = [`/api/meoo-finance-commission-rates${qs}`, `/api/merchant/finance/commission-rates${qs}`]
  const targets: string[] = []
  for (const p of paths) {
    for (const u of merchantApiFetchUrls(p)) {
      if (!targets.includes(u)) targets.push(u)
    }
  }

  try {
    let res: Response | null = null
    let bodyText = ''
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]!
      const r = await fetch(target, { method: 'GET', headers, signal: params?.signal })
      bodyText = await r.text()
      const contentType = r.headers.get('content-type') ?? ''
      if (r.status === 404 && isLikelyRouteMiss404(r, bodyText.trim(), contentType)) continue
      if (responseLooksLikeHtml(bodyText, contentType) && i < targets.length - 1) continue
      res = r
      break
    }
    if (!res) return { ok: false, message: '佣金率接口未部署' }
    if (responseLooksLikeHtml(bodyText, res.headers.get('content-type') ?? '')) {
      return { ok: false, message: '佣金率接口返回了 HTML，请检查部署路由。' }
    }
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(bodyText) as Record<string, unknown>
    } catch {
      return { ok: false, message: '佣金率响应非 JSON' }
    }
    if (!res.ok) {
      return {
        ok: false,
        message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
      }
    }
    const ratesRaw = data.rates
    const rates: FinanceCommissionRateRow[] = Array.isArray(ratesRaw)
      ? ratesRaw.map((row) => {
          const r = row as Record<string, unknown>
          return {
            platformId: String(r.platformId ?? ''),
            ok: r.ok === true,
            bound: r.bound === true,
            ratePct: Number(r.ratePct ?? 0) || 0,
            feeYuan: Number(r.feeYuan ?? 0) || 0,
            baseYuan: Number(r.baseYuan ?? 0) || 0,
            source: String(r.source ?? ''),
            sampleCount: typeof r.sampleCount === 'number' ? r.sampleCount : undefined,
            apiPath: typeof r.apiPath === 'string' ? r.apiPath : undefined,
            error: typeof r.error === 'string' ? r.error : undefined,
          }
        })
      : []
    return {
      ok: true,
      rates,
      warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : undefined,
      startDate: typeof data.startDate === 'string' ? data.startDate : undefined,
      endDate: typeof data.endDate === 'string' ? data.endDate : undefined,
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
