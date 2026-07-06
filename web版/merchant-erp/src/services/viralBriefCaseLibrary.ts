import type { RecruitOrderPickerRow } from '../lib/aiRecruitOrderContext'
import type { ViralBriefPlatform, ViralBriefResult, ViralBriefStyle } from './viralBriefAi'
import { STYLE_LABELS } from './viralBriefAi'
import { fetchBriefWebReferenceHits } from './viralBriefReferenceSearchApi'

export type ViralBriefReferenceCase = {
  id: string
  title: string
  platform?: string
  category?: string
  region?: string
  /** 外网原视频/搜索页链接 */
  originalVideoUrl?: string
  /** 外网封面（仅外链展示，不拉取站内文件） */
  originalThumbUrl?: string
  /** 外网场景图直链 */
  sceneImages: string[]
  originalSceneImages?: string[]
  matchScore: number
  matchReason: string
  aiPickReason?: string
  source: 'web_search' | 'platform_search'
}

function isExternalHttpUrl(url: string): boolean {
  const u = String(url || '').trim()
  return /^https?:\/\//i.test(u)
}

function toDisplayCase(hit: Awaited<ReturnType<typeof fetchBriefWebReferenceHits>>[number]): ViralBriefReferenceCase {
  const sceneImages = (hit.originalSceneImages || []).filter(isExternalHttpUrl)
  return {
    id: hit.id,
    title: hit.title,
    platform: hit.platform,
    originalVideoUrl: isExternalHttpUrl(hit.originalVideoUrl || '') ? hit.originalVideoUrl : undefined,
    originalThumbUrl: isExternalHttpUrl(hit.originalThumbUrl || '') ? hit.originalThumbUrl : undefined,
    originalSceneImages: sceneImages,
    sceneImages,
    matchScore: 1,
    matchReason: hit.matchReason,
    source: hit.source,
  }
}

/** 仅从抖音/小红书/网页检索相似案例（禁止读注册表、案例库或服务器本地文件） */
export async function pickViralBriefReferenceCases(args: {
  order: RecruitOrderPickerRow
  platform: ViralBriefPlatform
  style: ViralBriefStyle
  brief: Pick<ViralBriefResult, 'requirementSummary' | 'structure' | 'hooks' | 'topics'>
  limit?: number
  onProgress?: (msg: string) => void
}): Promise<ViralBriefReferenceCase[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 4, 6))
  args.onProgress?.('正在从抖音/网页检索相似视频与场景图（仅外网链接，不用站内案例库）…')

  try {
    const webHits = await fetchBriefWebReferenceHits({
      platform: args.platform,
      orderTitle: args.order.title,
      category: args.order.category,
      region: args.order.region,
      styleLabel: STYLE_LABELS[args.style],
      requirementSummary: args.brief.requirementSummary,
      topics: args.brief.topics,
      limit,
    })
    return webHits.map(toDisplayCase).slice(0, limit)
  } catch {
    return []
  }
}
