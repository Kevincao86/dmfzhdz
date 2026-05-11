/**
 * 门店毛利建议：由网关根据「门店配置行业」聚合类目并查询行业综合毛利率（全网口径），返回建议值。
 * 部署：优先 `GET /api/meoo-store-gross-margin-advisor`，回退 `GET /api/merchant/store/gross-margin-advisor`（可选 Bearer 抖音来客 token）
 */

import { readMerchantSession } from '../lib/merchantSession'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

export type PlatformMarginKey = 'douyin' | 'meituan' | 'xhs'

export type GrossMarginAdvisorResult =
  | {
      ok: true
      /** 行业名称，如「餐饮」 */
      industryName: string
      /** 类目路径，如 餐饮 > 火锅 */
      industryPath: string
      /** 行业编码，便于网关对接数据源 */
      industryCode?: string
      /** 各平台建议综合毛利率（%），与商品页三平台一致 */
      suggestedPercent: Record<PlatformMarginKey, number>
      /** 全网口径说明（展示用） */
      benchmarkNote: string
      /** 数据来源说明 */
      dataSource: string
      fetchedAt: string
    }
  | { ok: false; message: string }

export type GrossMarginAdvisorQuery = {
  /** 手动选择的行业编码；不传则按门店系统配置行业 */
  industryCode?: string
  /** 抖音来客类目 id（门店毛利配置传二级类目 id；兼容末级 id） */
  categoryId?: string
  /** 可选：类目路径（如 一级 > 二级），供网关检索与展示 */
  industryPath?: string
}

export async function fetchStoreGrossMarginAdvisor(
  query?: GrossMarginAdvisorQuery,
): Promise<GrossMarginAdvisorResult> {
  const token = readMerchantSession('meoo_douyin_merchant_token')
  const q = new URLSearchParams()
  const mid = readMerchantSession('meoo_douyin_merchant_id')
  if (mid) q.set('merchantId', mid)
  const ic = query?.industryCode?.trim()
  if (ic) q.set('industryCode', ic)
  const cid = query?.categoryId?.trim()
  if (cid) q.set('categoryId', cid)
  const ip = query?.industryPath?.trim()
  if (ip) q.set('industryPath', ip)
  const qs = `?${q}`
  const paths = ['/api/meoo-store-gross-margin-advisor', '/api/merchant/store/gross-margin-advisor'] as const
  const headers: HeadersInit = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  try {
    let res: Response | null = null
    let data: Record<string, unknown> = {}
    for (const p of paths) {
      const r = await fetch(url(`${p}${qs}`), { method: 'GET', headers })
      const text = await r.text()
      const ct = r.headers.get('content-type') ?? ''
      const trim = text.trimStart()
      if (r.ok && (trim.startsWith('<') || /text\/html/i.test(ct))) continue
      if (r.status === 404) continue
      let j: Record<string, unknown> = {}
      try {
        j = JSON.parse(text || '{}') as Record<string, unknown>
      } catch {
        j = {}
      }
      res = r
      data = j
      break
    }
    if (!res) {
      const r = await fetch(url(`${paths[1]}${qs}`), { method: 'GET', headers })
      const text = await r.text()
      try {
        data = JSON.parse(text || '{}') as Record<string, unknown>
      } catch {
        data = {}
      }
      res = r
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          (typeof data.message === 'string' && data.message) ||
          (typeof data.error === 'string' && data.error) ||
          `HTTP ${res.status}`,
      }
    }
    if (data.ok === false) {
      return {
        ok: false,
        message: typeof data.message === 'string' ? data.message : '获取毛利建议失败',
      }
    }
    const inner = data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : data
    const industryName = String(inner.industryName ?? inner.industry_name ?? '本地生活').trim()
    const industryPath = String(inner.industryPath ?? inner.industry_path ?? industryName).trim()
    const industryCode =
      typeof inner.industryCode === 'string'
        ? inner.industryCode
        : typeof inner.industry_code === 'string'
          ? inner.industry_code
          : undefined
    const sp = inner.suggestedPercent ?? inner.suggested_percent
    const suggestedPercent: Record<PlatformMarginKey, number> = {
      douyin: num((sp as Record<string, unknown>)?.douyin ?? inner.douyinSuggested),
      meituan: num((sp as Record<string, unknown>)?.meituan ?? inner.meituanSuggested),
      xhs: num((sp as Record<string, unknown>)?.xhs ?? inner.xhsSuggested),
    }
    const benchmarkNote = String(
      inner.benchmarkNote ?? inner.benchmark_note ?? '行业综合毛利率为估算区间，仅供参考；不构成经营或定价承诺。',
    ).trim()
    const dataSource = String(inner.dataSource ?? inner.data_source ?? '网关聚合').trim()
    const fetchedAt =
      typeof inner.fetchedAt === 'string'
        ? inner.fetchedAt
        : typeof inner.fetched_at === 'string'
          ? inner.fetched_at
          : new Date().toISOString()
    return {
      ok: true,
      industryName,
      industryPath,
      industryCode,
      suggestedPercent,
      benchmarkNote,
      dataSource,
      fetchedAt,
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(95, Math.max(5, Math.round(n)))
}
