import type { AiRecruitmentBriefPreview } from '../lib/aiAgentTypes'
import { loadProductEditLibraryDraftBriefPicks } from '../lib/productEditLibrary'
import { briefProductNameHint } from '../lib/aiAgentActionParse'
import { fetchIndustryProductTagsAi, generateThreeKolBriefs } from './recruitmentBriefAi'

const FALLBACK_TAGS = ['招牌菜', '探店打卡', '限时特惠', '网红爆款', '家庭聚餐']

function mainProductFromBrief(userBrief: string) {
  const drafts = loadProductEditLibraryDraftBriefPicks(8)
  const hint = briefProductNameHint(userBrief)
  const hit = drafts.find((d) => d.name.includes(hint.slice(0, 6)) || hint.includes(d.name.slice(0, 4)))
  if (hit) return hit
  if (drafts[0]) return drafts[0]
  return {
    id: 'ai-brief-main',
    name: hint,
    priceYuan: 99,
    source: 'erp_draftbox' as const,
  }
}

/** 为智能体达人招募预览生成图文 Brief（与招募页 Brief 向导同源能力） */
export async function buildAiRecruitmentBriefPreview(userBrief: string): Promise<AiRecruitmentBriefPreview> {
  const main = mainProductFromBrief(userBrief)
  let tags = [...FALLBACK_TAGS]
  try {
    const aiTags = await fetchIndustryProductTagsAi('餐饮')
    if (aiTags.length) tags = aiTags
  } catch {
    /* keep fallback */
  }
  const previews = await generateThreeKolBriefs({
    platformLabel: '抖音来客',
    industry: '餐饮',
    main,
    secondary: null,
    tags: tags.slice(0, 8),
  })
  return {
    platform: '抖音来客',
    mainProductName: main.name,
    tags: tags.slice(0, 8),
    briefText: previews[0],
    previews,
    enrichStatus: 'ready',
  }
}
