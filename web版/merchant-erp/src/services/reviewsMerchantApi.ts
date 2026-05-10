/**
 * 评论管理：经网关代理各平台「评价查询、回复评价」OpenAPI；本地 dev 由 Vite 插件转发（抖音走 goodlife/v1/akte/comment/*）。
 */

import { readMerchantSession } from '../lib/merchantSession'
import type { StorePlatformTab } from './merchantStoresApi'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

/** 与列表查询 query 一致（小红书为 xhs） */
export type ReviewsApiPlatform = 'douyin' | 'meituan' | 'xhs'

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
}

export function reviewsTabToApiPlatform(tab: StorePlatformTab): ReviewsApiPlatform | null {
  if (tab === 'jd') return null
  if (tab === 'xiaohongshu') return 'xhs'
  return tab
}

function getHeaders(): HeadersInit {
  const token = readMerchantSession('meoo_douyin_merchant_token')
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function postHeaders(): HeadersInit {
  return { ...getHeaders(), 'Content-Type': 'application/json' }
}

export type ReviewSentimentFilter = 'all' | ReviewSentiment

/** 与 GET `replyStatus` 一致 */
export type ReviewReplyStatusFilter = 'all' | 'replied' | 'unreplied'

export type ReviewListStats = {
  total: number
  replied: number
  unreplied: number
}

export async function fetchReviewsList(
  platform: ReviewsApiPlatform,
  sentiment: ReviewSentimentFilter,
  replyStatus: ReviewReplyStatusFilter = 'all',
): Promise<
  | { ok: true; items: ReviewListItem[]; stats?: ReviewListStats; syncedAt?: string }
  | { ok: false; message: string }
> {
  const q = new URLSearchParams({ platform, sentiment, replyStatus })
  try {
    const res = await fetch(url(`/api/merchant/reviews?${q}`), { method: 'GET', headers: getHeaders() })
    let data: Record<string, unknown> = {}
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      /* ignore */
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
): Promise<{ ok: true; syncedAt?: string; message?: string } | { ok: false; message: string }> {
  try {
    const res = await fetch(url('/api/merchant/reviews/sync'), {
      method: 'POST',
      headers: postHeaders(),
      body: JSON.stringify({ platform }),
    })
    let data: Record<string, unknown> = {}
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      /* ignore */
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
  try {
    const res = await fetch(url('/api/merchant/reviews/reply'), {
      method: 'POST',
      headers: postHeaders(),
      body: JSON.stringify({ platform, reviewId, content }),
    })
    let data: Record<string, unknown> = {}
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      /* ignore */
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
  try {
    const res = await fetch(url('/api/merchant/reviews/ai-suggest'), {
      method: 'POST',
      headers: postHeaders(),
      body: JSON.stringify({ platform, reviewId }),
    })
    let data: Record<string, unknown> = {}
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      /* ignore */
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
