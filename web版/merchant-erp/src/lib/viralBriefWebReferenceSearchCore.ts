/**
 * Brief 案例检索：从抖音/小红书/网页搜索相似探店视频与场景图（只检索，不生图不生视频）。
 */
import type { ViralBriefPlatform } from '../services/viralBriefAi.js'
import { buildBriefWebSearchQueriesFromContent } from './viralBriefReferenceKeywordCore.js'

export type BriefWebReferenceHit = {
  id: string
  title: string
  platform?: string
  originalVideoUrl?: string
  originalThumbUrl?: string
  originalSceneImages?: string[]
  matchReason: string
  source: 'web_search' | 'platform_search'
}

export const PLATFORM_SEARCH_HOST: Record<ViralBriefPlatform, { label: string; videoSearch: (q: string) => string }> = {
  douyin: {
    label: '抖音',
    videoSearch: (q) => `https://www.douyin.com/search/${encodeURIComponent(q)}`,
  },
  xiaohongshu: {
    label: '小红书',
    videoSearch: (q) =>
      `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(q)}&source=web_search_result_notes`,
  },
  kuaishou: {
    label: '快手',
    videoSearch: (q) => `https://www.kuaishou.com/search/video?searchKey=${encodeURIComponent(q)}`,
  },
  channels: {
    label: '微信视频号',
    videoSearch: (q) => `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(`视频号 ${q}`)}`,
  },
  dianping: {
    label: '大众点评',
    videoSearch: (q) => `https://www.dianping.com/search/keyword/${encodeURIComponent(1)}/${encodeURIComponent(q)}`,
  },
}

function norm(s: unknown): string {
  return String(s || '').trim()
}

function uniqueStrings(items: string[]): string[] {
  const out: string[] = []
  for (const raw of items) {
    const t = norm(raw)
    if (!t || out.includes(t)) continue
    out.push(t)
  }
  return out
}

/** @deprecated 请用 buildBriefWebSearchQueriesFromContent（viralBriefReferenceKeywordCore） */
export function buildBriefWebSearchQueries(input: {
  orderTitle?: string
  category?: string
  region?: string
  platform: ViralBriefPlatform
  styleLabel?: string
  requirementSummary?: string
  topics?: string[]
}): string[] {
  return buildBriefWebSearchQueriesFromContent({
    platform: input.platform,
    brief: {
      platform: input.platform,
      styleLabel: input.styleLabel,
      requirementSummary: input.requirementSummary,
      topics: input.topics,
      hooks: input.requirementSummary ? [input.requirementSummary.slice(0, 40)] : [],
    },
  })
}

export { buildBriefWebSearchQueriesFromContent } from './viralBriefReferenceKeywordCore.js'

/** 从订单 + Brief 提炼 — 已废弃，保留导出名兼容旧调用 */

function extractDouyinVideoUrls(html: string): string[] {
  const out: string[] = []
  const re = /https?:\/\/(?:www\.)?douyin\.com\/video\/\d+/gi
  for (const m of html.matchAll(re)) {
    const u = norm(m[0])
    if (u && !out.includes(u)) out.push(u)
  }
  const idRe = /\/video\/(\d{8,})/g
  for (const m of html.matchAll(idRe)) {
    const u = `https://www.douyin.com/video/${m[1]}`
    if (!out.includes(u)) out.push(u)
  }
  return out
}

function extractXhsExploreUrls(html: string): string[] {
  const out: string[] = []
  const re = /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item)\/[a-zA-Z0-9]+/gi
  for (const m of html.matchAll(re)) {
    const u = norm(m[0])
    if (u && !out.includes(u)) out.push(u)
  }
  return out
}

function extractImageUrls(html: string): string[] {
  const out: string[] = []
  const re = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi
  for (const m of html.matchAll(re)) {
    const u = norm(m[0])
    if (!u || u.includes('duckduckgo.com')) continue
    if (!out.includes(u)) out.push(u)
    if (out.length >= 8) break
  }
  return out
}

async function ddgHtmlSearch(query: string, timeoutMs = 14_000): Promise<string> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; MeooBriefSearch/1.0)',
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: ac.signal,
    })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

function platformSearchHits(platform: ViralBriefPlatform, query: string): BriefWebReferenceHit[] {
  const cfg = PLATFORM_SEARCH_HOST[platform]
  if (!cfg) return []
  const url = cfg.videoSearch(query)
  return [
    {
      id: `plat-${platform}-${query.slice(0, 24)}`,
      title: `${cfg.label}搜索：${query}`,
      platform: cfg.label,
      originalVideoUrl: url,
      matchReason: `按检索词「${query}」在${cfg.label}搜索相似视频`,
      source: 'platform_search',
    },
  ]
}

async function searchWebByQuery(
  query: string,
  platform: ViralBriefPlatform,
): Promise<BriefWebReferenceHit[]> {
  const hits: BriefWebReferenceHit[] = []
  const platLabel = PLATFORM_SEARCH_HOST[platform]?.label || '短视频'

  const videoQuery =
    platform === 'douyin'
      ? `site:douyin.com ${query} 探店 短视频`
      : platform === 'xiaohongshu'
        ? `site:xiaohongshu.com ${query} 探店 笔记`
        : `${query} ${platLabel} 探店 短视频`

  const html = await ddgHtmlSearch(videoQuery)
  const videoUrls =
    platform === 'xiaohongshu' ? extractXhsExploreUrls(html) : extractDouyinVideoUrls(html)

  for (const [i, url] of videoUrls.slice(0, 3).entries()) {
    hits.push({
      id: `web-v-${i}-${url.slice(-12)}`,
      title: `网页检索 · ${query}`,
      platform: platLabel,
      originalVideoUrl: url,
      matchReason: `检索词「${query}」· 外网相似${platLabel}视频`,
      source: 'web_search',
    })
  }

  const imageQuery = `${query} 探店 拍摄 场景图`
  const imgHtml = await ddgHtmlSearch(imageQuery, 10_000)
  const images = extractImageUrls(imgHtml).slice(0, 4)
  if (images.length) {
    hits.push({
      id: `web-img-${query.slice(0, 16)}`,
      title: `网页检索 · ${query} 场景参考图`,
      platform: platLabel,
      originalSceneImages: images,
      matchReason: '网页检索到相似拍摄场景图（非 AI 生成）',
      source: 'web_search',
    })
  }

  if (!videoUrls.length) {
    hits.push(...platformSearchHits(platform, query))
  }

  return hits
}

export async function searchBriefWebReferences(input: {
  platform: ViralBriefPlatform
  queries: string[]
  limit?: number
}): Promise<BriefWebReferenceHit[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 4, 8))
  const queries = uniqueStrings(input.queries).slice(0, 3)
  if (!queries.length) return []

  const merged: BriefWebReferenceHit[] = []
  const seenVideo = new Set<string>()
  const seenImage = new Set<string>()

  for (const q of queries) {
    if (merged.length >= limit) break
    const batch = await searchWebByQuery(q, input.platform)
    for (const hit of batch) {
      if (merged.length >= limit) break
      const vKey = norm(hit.originalVideoUrl)
      if (vKey) {
        if (seenVideo.has(vKey)) continue
        seenVideo.add(vKey)
      }
      const imgs = (hit.originalSceneImages || []).filter((u) => {
        if (seenImage.has(u)) return false
        seenImage.add(u)
        return true
      })
      if (!vKey && imgs.length === 0) continue
      merged.push({ ...hit, originalSceneImages: imgs.length ? imgs : hit.originalSceneImages })
    }
  }

  return merged.slice(0, limit)
}
