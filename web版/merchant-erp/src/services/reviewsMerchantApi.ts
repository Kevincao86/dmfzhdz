/**
 * 评论管理：经网关代理各平台「评价查询、回复评价」OpenAPI；本地 dev 由 Vite 插件转发（抖音走 goodlife/v1/akte/comment/*）。
 */

import { readMerchantSession } from '../lib/merchantSession'
import { isLikelyRouteMiss404, isLikelyHtmlApiResponse, merchantApiFetchUrlCandidates } from './douyinProductApi'
import type { StorePlatformTab } from './merchantStoresApi'

/** 与列表查询 query 一致（小红书为 xhs） */
export type ReviewsApiPlatform =
  | 'douyin'
  | 'kuaishou'
  | 'meituan'
  | 'xhs'
  | 'eleme'
  | 'meituan_waimai'
  | 'jd_waimai'

export type ReviewSentiment = 'good' | 'neutral' | 'bad'

export type ReviewListItem = {
  id: string
  platform: ReviewsApiPlatform
  sentiment: ReviewSentiment
  userName: string
  ratingStars: number
  content: string
  createdAt: string
  replied: boolean
  replyText?: string
  reviewKind?: 'store' | 'product'
  poiId?: string
  poiName?: string
  productId?: string
  productName?: string
}

export function reviewsTabToApiPlatform(tab: StorePlatformTab): ReviewsApiPlatform | null {
  if (tab === 'jd') return null
  if (tab === 'xiaohongshu') return 'xhs'
  if (tab === 'eleme' || tab === 'meituan_waimai' || tab === 'jd_waimai') return tab
  if (tab === 'douyin' || tab === 'kuaishou' || tab === 'meituan') return tab
  return null
}

function platformSessionHeaders(platform?: ReviewsApiPlatform): HeadersInit {
  const douyin = readMerchantSession('meoo_douyin_merchant_token')
  const kuaishou = readMerchantSession('meoo_kuaishou_merchant_token')
  const meituan = readMerchantSession('meoo_meituan_merchant_token')
  const xhs = readMerchantSession('meoo_xhs_merchant_token')
  const eleme = readMerchantSession('meoo_eleme_merchant_token')
  const meituanWaimai = readMerchantSession('meoo_meituan_waimai_merchant_token')
  const jdWaimai = readMerchantSession('meoo_jd_waimai_merchant_token')
  let primary = douyin ?? meituan ?? xhs ?? eleme ?? meituanWaimai ?? jdWaimai
  if (platform === 'meituan') primary = meituan ?? primary
  if (platform === 'douyin') primary = douyin ?? primary
  if (platform === 'kuaishou') primary = kuaishou ?? primary
  if (platform === 'xhs') primary = xhs ?? primary
  if (platform === 'eleme') primary = eleme ?? primary
  if (platform === 'meituan_waimai') primary = meituanWaimai ?? primary
  if (platform === 'jd_waimai') primary = jdWaimai ?? primary
  const h: Record<string, string> = { Accept: 'application/json' }
  if (primary) h.Authorization = `Bearer ${primary}`
  if (douyin) h['X-Meoo-Douyin-Token'] = douyin
  if (kuaishou) h['X-Meoo-Kuaishou-Token'] = kuaishou
  if (meituan) h['X-Meoo-Meituan-Token'] = meituan
  if (xhs) h['X-Meoo-Xhs-Token'] = xhs
  if (eleme) h['X-Meoo-Eleme-Token'] = eleme
  if (meituanWaimai) h['X-Meoo-Meituan-Waimai-Token'] = meituanWaimai
  if (jdWaimai) h['X-Meoo-Jd-Waimai-Token'] = jdWaimai
  return h
}

function postHeaders(platform?: ReviewsApiPlatform): HeadersInit {
  return { ...platformSessionHeaders(platform), 'Content-Type': 'application/json' }
}

export type ReviewSentimentFilter = 'all' | ReviewSentiment

/** 与 GET `replyStatus` 一致 */
export type ReviewReplyStatusFilter = 'all' | 'replied' | 'unreplied'

export type ReviewListStats = {
  total: number
  replied: number
  unreplied: number
}

export type ReviewKind = 'store' | 'product'

export async function fetchReviewsList(
  platform: ReviewsApiPlatform,
  sentiment: ReviewSentimentFilter,
  replyStatus: ReviewReplyStatusFilter = 'all',
  opts?: { kind?: ReviewKind; poiId?: string; productId?: string },
): Promise<
  | { ok: true; items: ReviewListItem[]; stats?: ReviewListStats; syncedAt?: string }
  | { ok: false; message: string }
> {
  const q = new URLSearchParams({ platform, sentiment, replyStatus })
  if (opts?.kind) q.set('kind', opts.kind)
  if (opts?.poiId?.trim()) q.set('poiId', opts.poiId.trim())
  if (opts?.productId?.trim()) q.set('productId', opts.productId.trim())
  const paths = [`/api/meoo-merchant-reviews?${q}`, `/api/merchant/reviews?${q}`]
  try {
    let res: Response | null = null
    let data: Record<string, unknown> = {}
    for (const target of merchantApiFetchUrlCandidates(paths)) {
      const r = await fetch(target, {
        method: 'GET',
        headers: platformSessionHeaders(platform),
      })
      const text = await r.text()
      const trim = text.trimStart()
      const ct = r.headers.get('content-type') ?? ''
      if (r.status === 404 && isLikelyRouteMiss404(r, trim, ct)) {
        continue
      }
      if (isLikelyHtmlApiResponse(trim, ct)) {
        continue
      }
      res = r
      try {
        data = JSON.parse(text) as Record<string, unknown>
      } catch {
        /* ignore */
      }
      break
    }
    if (!res) {
      return { ok: false, message: '评论接口未部署' }
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
    const items = Array.isArray(data.items) ? (data.items as ReviewListItem[]) : []
    const syncedAt = typeof data.syncedAt === 'string' ? data.syncedAt : undefined
    let stats: ReviewListStats | undefined
    const s = data.stats as Record<string, unknown> | undefined
    if (
      s &&
      typeof s.total === 'number' &&
      typeof s.replied === 'number' &&
      typeof s.unreplied === 'number'
    ) {
      stats = { total: s.total, replied: s.replied, unreplied: s.unreplied }
    }
    return { ok: true, items, stats, syncedAt }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function postReviewsSync(
  platform: ReviewsApiPlatform | 'all',
  opts?: {
    kind?: ReviewKind
    poiId?: string
    productId?: string
    poiIds?: string[]
    productIds?: string[]
  },
): Promise<
  | { ok: true; syncedAt?: string; message?: string; items?: ReviewListItem[] }
  | { ok: false; message: string }
> {
  const body = JSON.stringify({
    platform,
    kind: opts?.kind,
    poiId: opts?.poiId,
    productId: opts?.productId,
    poiIds: opts?.poiIds,
    productIds: opts?.productIds,
  })
  const paths = ['/api/meoo-merchant-reviews-sync', '/api/merchant/reviews/sync']
  try {
    let res: Response | null = null
    let data: Record<string, unknown> = {}
    for (const target of merchantApiFetchUrlCandidates(paths)) {
      const r = await fetch(target, {
        method: 'POST',
        headers: postHeaders(platform === 'all' ? undefined : platform),
        body,
      })
      const text = await r.text()
      const trim = text.trimStart()
      const ct = r.headers.get('content-type') ?? ''
      if (r.status === 404 && isLikelyRouteMiss404(r, trim, ct)) {
        continue
      }
      if (isLikelyHtmlApiResponse(trim, ct)) {
        continue
      }
      res = r
      try {
        data = JSON.parse(text) as Record<string, unknown>
      } catch {
        /* ignore */
      }
      break
    }
    if (!res) {
      return { ok: false, message: '评论同步接口未部署' }
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
    return {
      ok: true,
      syncedAt: typeof data.syncedAt === 'string' ? data.syncedAt : undefined,
      message: typeof data.message === 'string' ? data.message : undefined,
      items: Array.isArray(data.items) ? (data.items as ReviewListItem[]) : undefined,
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function postReviewReply(
  platform: ReviewsApiPlatform,
  reviewId: string,
  content: string,
): Promise<{ ok: true; item: ReviewListItem } | { ok: false; message: string }> {
  const body = JSON.stringify({ platform, reviewId, content })
  const paths = ['/api/meoo-merchant-reviews-reply', '/api/merchant/reviews/reply']
  try {
    let res: Response | null = null
    let data: Record<string, unknown> = {}
    for (const target of merchantApiFetchUrlCandidates(paths)) {
      const r = await fetch(target, {
        method: 'POST',
        headers: postHeaders(platform),
        body,
      })
      const text = await r.text()
      if (r.status === 404 && isLikelyRouteMiss404(r, text.trim(), r.headers.get('content-type') ?? '')) {
        continue
      }
      res = r
      try {
        data = JSON.parse(text) as Record<string, unknown>
      } catch {
        /* ignore */
      }
      break
    }
    if (!res) {
      return { ok: false, message: '评论回复接口未部署' }
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
    const item = data.item as ReviewListItem | undefined
    if (!item || typeof item !== 'object') {
      return { ok: false, message: '响应缺少 item' }
    }
    return { ok: true, item }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function postReviewAiSuggest(
  platform: ReviewsApiPlatform,
  reviewId: string,
): Promise<{ ok: true; suggestion: string } | { ok: false; message: string }> {
  const body = JSON.stringify({ platform, reviewId })
  const paths = ['/api/meoo-merchant-reviews-ai-suggest', '/api/merchant/reviews/ai-suggest']
  try {
    let res: Response | null = null
    let data: Record<string, unknown> = {}
    for (const target of merchantApiFetchUrlCandidates(paths)) {
      const r = await fetch(target, {
        method: 'POST',
        headers: postHeaders(platform),
        body,
      })
      const text = await r.text()
      if (r.status === 404 && isLikelyRouteMiss404(r, text.trim(), r.headers.get('content-type') ?? '')) {
        continue
      }
      res = r
      try {
        data = JSON.parse(text) as Record<string, unknown>
      } catch {
        /* ignore */
      }
      break
    }
    if (!res) {
      return { ok: false, message: 'AI 话术接口未部署' }
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
    const suggestion = typeof data.suggestion === 'string' ? data.suggestion : ''
    if (!suggestion) return { ok: false, message: '响应缺少 suggestion' }
    return { ok: true, suggestion }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
