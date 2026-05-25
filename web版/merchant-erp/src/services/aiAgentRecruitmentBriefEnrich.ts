import type { AiRecruitmentBriefPreview } from '../lib/aiAgentTypes'
import {
  loadMerchantBriefProductPicks,
  pickBriefMainAndSecondary,
  resolveMerchantBriefContext,
} from '../lib/merchantBriefCatalog'
import { inferIndustryVisualCategory } from '../lib/douyinProductImageAnchor'
import { fetchIndustryProductTagsAi, generateThreeKolBriefs } from './recruitmentBriefAi'

const TAGS_AI_TIMEOUT_MS = 20_000
const BRIEFS_AI_TIMEOUT_MS = 60_000

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

function defaultTagsForContext(industryLabel: string, hint: string): string[] {
  const combined = `${industryLabel} ${hint}`
  if (/数码|3c|3C|手机|电脑|电子|科技|潮品|配件|智能/.test(combined)) {
    return ['数码潮品', '智能穿戴', '学生专享', '家庭娱乐', '开学季', '探店打卡', '性价比', '到店体验']
  }
  if (/餐饮|美食|火锅|烧烤|咖啡|茶饮/.test(combined)) {
    return ['招牌菜', '探店必点', '性价比', '家庭聚餐', '打卡', '限时特惠', '新品推荐']
  }
  return ['探店打卡', '性价比', '到店体验', '限时特惠', '本地生活', '种草推荐']
}

function buildLocalThreeBriefs(
  mainName: string,
  tags: string[],
  ctx: { industryLabel: string; storeName?: string },
): [string, string, string] {
  const tagLine = tags.slice(0, 5).join('、') || '本地生活'
  const store = ctx.storeName?.trim() ? `【${ctx.storeName}】` : ''
  const base = `${store}${mainName}｜${ctx.industryLabel}｜${tagLine}`
  return [
    `${base}\n\n版本 A（理性种草）：先讲用户痛点与使用场景，再突出 ${mainName} 的核心卖点与到店/下单理由，适合测评口播。`,
    `${base}\n\n版本 B（场景叙事）：以好友/家庭/学生等真实场景切入，强调体验情绪与 "${tagLine}" 相关话题，适合剧情短视频。`,
    `${base}\n\n版本 C（清单体）：用「3 个理由必打卡/必买」结构，结合 ${tagLine} 标签与平台热点，适合图文切片。`,
  ]
}

/** 不依赖 AI 的本地 Brief（保证预览卡片不会无限 loading） */
export function buildLocalRecruitmentBriefPreview(
  userBrief: string,
  assistantContent?: string,
): AiRecruitmentBriefPreview {
  const ctx = resolveMerchantBriefContext()
  const catalog = loadMerchantBriefProductPicks(24)
  const hint = [userBrief, assistantContent].filter(Boolean).join('\n').slice(0, 3500)
  const { main } = pickBriefMainAndSecondary(userBrief, catalog, hint)

  let tags = catalog
    .slice(0, 6)
    .map((p) => p.name)
    .filter(Boolean)
  if (!tags.length) tags = defaultTagsForContext(ctx.industryLabel, hint)

  const previews = buildLocalThreeBriefs(main.name, tags, {
    industryLabel: ctx.industryLabel,
    storeName: ctx.storeName,
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

/** 为智能体达人招募预览生成图文 Brief（与招募页 Brief 向导同源能力，绑定账号类目 + 菜单/草稿商品） */
export async function buildAiRecruitmentBriefPreview(
  userBrief: string,
  assistantContent?: string,
): Promise<AiRecruitmentBriefPreview> {
  const local = buildLocalRecruitmentBriefPreview(userBrief, assistantContent)
  const ctx = resolveMerchantBriefContext()
  const catalog = loadMerchantBriefProductPicks(24)
  const hint = [userBrief, assistantContent].filter(Boolean).join('\n').slice(0, 3500)
  const { main, secondary } = pickBriefMainAndSecondary(userBrief, catalog, hint)

  const kolCtx = {
    storeName: ctx.storeName,
    industryPath: ctx.industryPath,
    menuSummary: ctx.menuSummary,
  }

  let tags = local.tags
  if (inferIndustryVisualCategory(ctx.industryPath, hint) === 'digital') {
    tags = defaultTagsForContext(ctx.industryLabel, hint)
  }

  try {
    const aiTags = await withTimeout(
      fetchIndustryProductTagsAi(ctx.industryLabel, kolCtx),
      TAGS_AI_TIMEOUT_MS,
      '标签生成',
    )
    if (aiTags.length) tags = aiTags
  } catch {
    /* keep local tags */
  }

  try {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ...local,
      tags: tags.slice(0, 8),
      enrichError: `AI 文案优化未完成（${msg.slice(0, 80)}），已展示本地生成版本。`,
    }
  }
}
