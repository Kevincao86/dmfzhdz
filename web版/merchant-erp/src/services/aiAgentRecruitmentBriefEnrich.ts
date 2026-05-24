import type { AiRecruitmentBriefPreview } from '../lib/aiAgentTypes'
import {
  loadMerchantBriefProductPicks,
  pickBriefMainAndSecondary,
  resolveMerchantBriefContext,
} from '../lib/merchantBriefCatalog'
import { fetchIndustryProductTagsAi, generateThreeKolBriefs } from './recruitmentBriefAi'

/** 为智能体达人招募预览生成图文 Brief（与招募页 Brief 向导同源能力，绑定账号类目 + 菜单/草稿商品） */
export async function buildAiRecruitmentBriefPreview(
  userBrief: string,
  assistantContent?: string,
): Promise<AiRecruitmentBriefPreview> {
  const ctx = resolveMerchantBriefContext()
  const catalog = loadMerchantBriefProductPicks(24)
  const hint = [userBrief, assistantContent].filter(Boolean).join('\n')
  const { main, secondary } = pickBriefMainAndSecondary(userBrief, catalog, hint)

  const kolCtx = {
    storeName: ctx.storeName,
    industryPath: ctx.industryPath,
    menuSummary: ctx.menuSummary,
  }

  let tags: string[] = []
  try {
    const aiTags = await fetchIndustryProductTagsAi(ctx.industryLabel, kolCtx)
    if (aiTags.length) tags = aiTags
  } catch {
    /* fallback below */
  }
  if (!tags.length && ctx.menuItemCount > 0) {
    tags = catalog
      .slice(0, 6)
      .map((p) => p.name)
      .filter(Boolean)
  }

  const previews = await generateThreeKolBriefs({
    platformLabel: '抖音来客',
    industry: ctx.industryLabel,
    main,
    secondary: secondary && secondary.id !== main.id ? secondary : null,
    tags: tags.slice(0, 8),
    ctx: kolCtx,
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
