import type { AiRecruitmentBriefPreview } from '../lib/aiAgentTypes'
import {
  loadMerchantBriefProductPicks,
  pickBriefMainAndSecondary,
  resolveMerchantBriefContext,
} from '../lib/merchantBriefCatalog'
import { fetchIndustryProductTagsAi, generateThreeKolBriefs } from './recruitmentBriefAi'

const TAGS_AI_TIMEOUT_MS = 25_000
const BRIEFS_AI_TIMEOUT_MS = 90_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label}超时（${Math.round(ms / 1000)}s）`)),
      ms,
    )
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** 为智能体达人招募预览生成图文 Brief（与招募页 Brief 向导同源能力，绑定账号类目 + 菜单/草稿商品） */
export async function buildAiRecruitmentBriefPreview(
  userBrief: string,
  assistantContent?: string,
): Promise<AiRecruitmentBriefPreview> {
  const ctx = resolveMerchantBriefContext()
  const catalog = loadMerchantBriefProductPicks(24)
  const hint = [userBrief, assistantContent].filter(Boolean).join('\n').slice(0, 3500)
  const { main, secondary } = pickBriefMainAndSecondary(userBrief, catalog, hint)

  const kolCtx = {
    storeName: ctx.storeName,
    industryPath: ctx.industryPath,
    menuSummary: ctx.menuSummary,
  }

  let tags: string[] = []
  try {
    const aiTags = await withTimeout(
      fetchIndustryProductTagsAi(ctx.industryLabel, kolCtx),
      TAGS_AI_TIMEOUT_MS,
      '标签生成',
    )
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

  const previews = await withTimeout(
    generateThreeKolBriefs({
    platformLabel: '抖音来客',
    industry: ctx.industryLabel,
    main,
    secondary: secondary && secondary.id !== main.id ? secondary : null,
    tags: tags.slice(0, 8),
    ctx: kolCtx,
    }),
    BRIEFS_AI_TIMEOUT_MS,
    'Brief 文案生成',
  )

  return {
    platform: '抖音来客',
    mainProductName: main.name,
    tags: tags.slice(0, 8),
    briefText: previews[0],
    previews,
    enrichStatus: 'ready',
  }
}
