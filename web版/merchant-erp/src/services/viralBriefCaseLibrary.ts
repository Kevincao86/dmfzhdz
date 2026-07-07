import type { RecruitOrderPickerRow } from '../lib/aiRecruitOrderContext'
import type { BriefContentForSearch } from '../lib/viralBriefReferenceKeywordCore'
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

function briefToSearchContent(
  platform: ViralBriefPlatform,
  style: ViralBriefStyle,
  brief: ViralBriefResult,
): BriefContentForSearch {
  return {
    platform,
    styleLabel: STYLE_LABELS[style],
    requirementSummary: brief.requirementSummary,
    hooks: brief.hooks,
    titles: brief.titles,
    topics: brief.topics,
    mustMention: brief.mustMention,
    forbidden: brief.forbidden,
    structure: brief.structure,
    openingParagraph: brief.openingParagraph,
    bodySections: brief.bodySections,
    fullCopy: brief.fullCopy,
  }
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

/** 仅从外网检索：服务端 AI 根据已生成 Brief 提炼关键词后搜索（不用招募单名） */
export async function pickViralBriefReferenceCases(args: {
  order: RecruitOrderPickerRow
  platform: ViralBriefPlatform
  style: ViralBriefStyle
  brief: ViralBriefResult
  limit?: number
  onProgress?: (msg: string) => void
}): Promise<ViralBriefReferenceCase[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 4, 6))
  args.onProgress?.('正在根据 Brief 正文提炼检索词，并从抖音/网页搜索相似案例…')

  try {
    const webHits = await fetchBriefWebReferenceHits({
      platform: args.platform,
      briefContent: briefToSearchContent(args.platform, args.style, args.brief),
      limit,
    })
    return webHits.map(toDisplayCase).slice(0, limit)
  } catch {
    return []
  }
}
