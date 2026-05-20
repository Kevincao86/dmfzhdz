import { readMerchantSession } from '../lib/merchantSession'
import type {
  MarketingActivityItem,
  MarketingActivityListResult,
  MarketingActivityPlatform,
  MarketingActivityUiStatus,
} from '../lib/marketingActivityTypes'
import { merchantApiFetchUrlCandidates } from './douyinProductApi'

function responseLooksLikeHtml(text: string, contentType: string): boolean {
  const t = text.trimStart()
  return t.startsWith('<') || /text\/html/i.test(contentType)
}

function tokenForPlatform(platform: MarketingActivityPlatform): string | null {
  if (platform === 'douyin') return readMerchantSession('meoo_douyin_merchant_token')
  if (platform === 'meituan') return readMerchantSession('meoo_meituan_merchant_token')
  if (platform === 'xiaohongshu') return readMerchantSession('meoo_xhs_merchant_token')
  if (platform === 'eleme') return readMerchantSession('meoo_eleme_merchant_token')
  if (platform === 'meituan_waimai') return readMerchantSession('meoo_meituan_waimai_merchant_token')
  return readMerchantSession('meoo_jd_waimai_merchant_token')
}

function normalizeItems(raw: unknown, platform: MarketingActivityPlatform): MarketingActivityItem[] {
  if (!Array.isArray(raw)) return []
  const out: MarketingActivityItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = String(r.id ?? r.activity_id ?? '').trim()
    if (!id) continue
    const uiStatus = r.uiStatus ?? r.ui_status
    const safeStatus: MarketingActivityUiStatus =
      uiStatus === 'ongoing' ||
      uiStatus === 'enrollable' ||
      uiStatus === 'ended' ||
      uiStatus === 'unknown'
        ? uiStatus
        : 'unknown'
    out.push({
      id,
      platform,
      title: String(r.title ?? r.activity_name ?? '平台活动').trim(),
      summary: typeof r.summary === 'string' ? r.summary : undefined,
      uiStatus: safeStatus,
      startAt: typeof r.startAt === 'string' ? r.startAt : undefined,
      endAt: typeof r.endAt === 'string' ? r.endAt : undefined,
      enrollDeadline: typeof r.enrollDeadline === 'string' ? r.enrollDeadline : undefined,
      enrollUrl: typeof r.enrollUrl === 'string' ? r.enrollUrl : undefined,
      rawStatus:
        typeof r.rawStatus === 'string' || typeof r.rawStatus === 'number' ? r.rawStatus : undefined,
    })
  }
  return out
}

export type MarketingActivityStatusFilter = 'all' | MarketingActivityUiStatus

export async function fetchMarketingActivities(params: {
  platform: MarketingActivityPlatform
  status?: MarketingActivityStatusFilter
  page?: number
  pageSize?: number
}): Promise<MarketingActivityListResult> {
  const token = tokenForPlatform(params.platform)
  if (!token) {
    const label =
      params.platform === 'douyin'
        ? '抖音来客'
        : params.platform === 'meituan'
          ? '美团'
          : '小红书'
    return {
      ok: false,
      platform: params.platform,
      message: `未绑定${label}，请先在系统设置完成授权`,
    }
  }

  const q = new URLSearchParams({
    platform: params.platform,
    page: String(Math.max(1, params.page ?? 1)),
    page_size: String(Math.min(50, Math.max(1, params.pageSize ?? 20))),
  })
  const st = params.status ?? 'all'
  if (st !== 'all') q.set('status', st)

  const qs = `?${q}`
  const paths = [`/api/meoo-marketing-activities${qs}`, `/api/merchant/marketing/activities${qs}`]
  const targets = merchantApiFetchUrlCandidates(paths)

  let res: Response | null = null
  let bodyText = ''
  for (const target of targets) {
    const r = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    const text = await r.text()
    const ct = r.headers.get('content-type') ?? ''
    if (r.status === 404) continue
    if (r.ok && responseLooksLikeHtml(text, ct)) continue
    res = r
    bodyText = text
    break
  }

  if (!res) {
    return {
      ok: false,
      platform: params.platform,
      message: '营销活动接口 404（请部署 api/meoo-marketing-activities）',
    }
  }

  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(bodyText || '{}') as Record<string, unknown>
  } catch {
    data = {}
  }

  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : `拉取失败 HTTP ${res.status}`
    return { ok: false, platform: params.platform, message: msg }
  }
  if (data.ok === false) {
    const msg = typeof data.message === 'string' ? data.message : '拉取失败'
    return { ok: false, platform: params.platform, message: msg }
  }

  const items = normalizeItems(data.items, params.platform)
  const filtered =
    st === 'all' ? items : items.filter((it) => it.uiStatus === st || it.uiStatus === 'unknown')

  return {
    ok: true,
    platform: params.platform,
    items: filtered,
    total: Number(data.total) || filtered.length,
    syncedAt: typeof data.syncedAt === 'string' ? data.syncedAt : new Date().toISOString(),
    upstreamNote: typeof data.upstreamNote === 'string' ? data.upstreamNote : undefined,
  }
}
