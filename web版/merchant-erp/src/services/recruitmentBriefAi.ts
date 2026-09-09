import { postDouyinGoodsAiAssist, type AiModelId } from './douyinAiAssistApi'
import { resolveTextAiModelForRequest } from './merchantAiModelStorage'

const FALLBACK_TAGS = [
  '招牌菜',
  '新品推荐',
  '限时特惠',
  '网红爆款',
  '健康轻食',
  '家庭套餐',
  '商务宴请',
  '情侣约会',
  '下午茶',
  '夜宵必点',
  '地方特色',
  '进口食材',
]

function parseJsonTags(text: string): string[] | null {
  const t = text.trim()
  const tryParse = (s: string) => {
    try {
      const j = JSON.parse(s) as unknown
      if (Array.isArray(j)) {
        return j.map((x) => String(x).trim()).filter(Boolean)
      }
      if (j && typeof j === 'object' && Array.isArray((j as { tags?: unknown }).tags)) {
        return ((j as { tags: unknown[] }).tags ?? []).map((x) => String(x).trim()).filter(Boolean)
      }
    } catch {
      /* ignore */
    }
    return null
  }
  const direct = tryParse(t)
  if (direct?.length) return direct.slice(0, 16)
  const m = t.match(/\[[\s\S]*\]/)
  if (m) {
    const inner = tryParse(m[0])
    if (inner?.length) return inner.slice(0, 16)
  }
  return null
}

/** 按当前绑定模型与行业，向 AI 请求 Brief 用商品/场景标签（失败则回退本地词表） */
export async function fetchIndustryProductTagsAi(
  industry: string,
  ctx?: KolBriefGenerationContext,
): Promise<string[]> {
  const model = resolveTextAiModelForRequest() as AiModelId
  const menuBlock = ctx?.menuSummary
    ? `\n门店菜单/产品参考（标签须贴合以下真实品类与品项，禁止套用无关行业词如「招牌菜」除非确为餐饮）：\n${ctx.menuSummary.slice(0, 900)}`
    : ''
  const titleDraft = `经营行业/绑定类目：${industry || '本地生活'}。
${ctx?.storeName ? `门店名称：${ctx.storeName}` : ''}
${ctx?.industryPath && ctx.industryPath !== industry ? `类目路径：${ctx.industryPath}` : ''}${menuBlock}
请只输出一个 JSON 数组（字符串数组），包含 10～14 个适合「${industry || '本地生活'}」达人探店/种草 Brief 的中文标签词，须与上述类目及菜单一致。
除 JSON 外不要输出任何文字。`
  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_topic',
    product_name: `达人Brief标签｜${industry || '餐饮'}`,
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) return [...FALLBACK_TAGS]
  const parsed = parseJsonTags(r.description)
  if (parsed?.length) return Array.from(new Set(parsed))
  return [...FALLBACK_TAGS]
}

export type BriefProductPick = {
  id: string
  name: string
  priceYuan: number
  /** 商品来源：菜单价目 / 草稿箱 / 来客线上 */
  source?: 'store_menu' | 'erp_draftbox' | 'douyin_online'
}

export type KolBriefGenerationContext = {
  storeName?: string
  industryPath?: string
  menuSummary?: string
}

function splitThreeBriefs(description: string): [string, string, string] {
  const parts = description
    .split(/\|\|\|BREAK\|\|\|/g)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length >= 3) return [parts[0]!, parts[1]!, parts[2]!]
  const paras = description.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
  if (paras.length >= 3) return [paras[0]!, paras[1]!, paras[2]!]
  const one = description.trim() || '（模型未返回有效 Brief，请重试或检查 API Key）'
  const short = one.slice(0, Math.min(one.length, 420))
  return [
    `${short}\n\n【版本 A】侧重卖点与到店理由`,
    `${short}\n\n【版本 B】侧重场景体验与情绪共鸣`,
    `${short}\n\n【版本 C】侧重平台话题与传播钩子`,
  ]
}

/** 生成 3 版可复制的达人合作 Brief（单轮 operation_article，按分隔符解析） */
export async function generateThreeKolBriefs(args: {
  platformLabel: string
  industry: string
  main: BriefProductPick
  secondary?: BriefProductPick | null
  tags: string[]
  ctx?: KolBriefGenerationContext
  /** 智能体方案全文：Brief 须逐项呼应组品/赠品/达人策略 */
  planContext?: string
}): Promise<[string, string, string]> {
  const model = resolveTextAiModelForRequest() as AiModelId
  const sec = args.secondary
  const ctx = args.ctx
  const menuBlock = ctx?.menuSummary
    ? `\n菜单/产品参考（Brief 须基于真实品项，勿虚构未出现的菜品或服务）：\n${ctx.menuSummary.slice(0, 1200)}`
    : ''
  const planBlock = args.planContext?.trim()
    ? `\n\n营销/组品/达人招募方案（Brief 须逐项呼应下列套餐、赠品与达人策略，勿泛泛而谈）：\n${args.planContext.trim().slice(0, 4500)}`
    : ''
  const priceMain =
    args.main.priceYuan > 0 ? `约 ¥${args.main.priceYuan}` : '价格见门店菜单'
  const priceSec = sec && sec.priceYuan > 0 ? `约 ¥${sec.priceYuan}` : '价格见门店菜单'
  const titleDraft = `你是达人商务与内容策划。请根据以下事实，写 3 个不同风格的「达人探店/种草合作 Brief」，用于 ${args.platformLabel} 投放。
经营类目：${args.industry || '本地生活'}${ctx?.industryPath && ctx.industryPath !== args.industry ? `（${ctx.industryPath}）` : ''}
${ctx?.storeName ? `门店：${ctx.storeName}` : ''}${menuBlock}${planBlock}
主推商品/服务：${args.main.name}（${priceMain}）
${sec ? `次推商品/服务：${sec.name}（${priceSec}）` : '无固定次推品。'}
已选标签：${args.tags.join('、')}

硬性要求：Brief 场景、卖点与标签须严格匹配上述经营类目、真实商品与方案内容，禁止默认写成餐饮/程序员食堂等无关模板。
每版 Brief 须包含：推广目标、主推品/套餐卖点、内容形式、拍摄/口播要点、话术钩子、转化动作（下单/到店/领券）、禁忌事项；三版分别侧重测评理性种草、场景故事叙事、热点清单体。
硬性输出格式：恰好三个文本块，块与块之间只用单独一行「|||BREAK|||」分隔（共出现两次分隔行）。不要 Markdown 标题符号，不要编号前缀。每块 280～450 字，语气与结构需明显不同。`

  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_article',
    product_name: `达人Brief｜${args.main.name}`,
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) {
    const tagLine = args.tags.slice(0, 5).join('、')
    const base = `【${args.main.name}｜¥${args.main.priceYuan}】围绕${tagLine}等标签，突出门店体验与转化点。`
    return [
      `${base}\n\n版本一：理性种草结构，先场景痛点再产品解决方案，适合测评口播。`,
      `${base}\n\n版本二：故事化叙事，强调同桌好友/家庭聚餐情绪，适合剧情短视频。`,
      `${base}\n\n版本三：热点话题+打卡清单体，适合图文与信息流切片。`,
    ]
  }
  return splitThreeBriefs(r.description)
}

export type RecruitWizardRequirementDraft = {
  goal?: string
  audience?: string
  sellingPoints?: string[]
  storyAngle?: string
  mustShoot?: string[]
  talkTrack?: string[]
  hooks?: [string, string]
  durationHint?: string
  deliverables?: string
  convertAction?: string
  storeCoop?: string
  tabooItems?: string[]
  hashtags?: string[]
}

function parseRequirementDraft(text: string): RecruitWizardRequirementDraft | null {
  const t = text.trim()
  const tryParse = (s: string): RecruitWizardRequirementDraft | null => {
    try {
      const j = JSON.parse(s) as Record<string, unknown>
      if (!j || typeof j !== 'object') return null
      const list = (v: unknown) =>
        Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => x.length >= 4) : []
      const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
      const hooksRaw = list(j.hooks)
      return {
        goal: str(j.goal),
        audience: str(j.audience),
        sellingPoints: list(j.sellingPoints),
        storyAngle: str(j.storyAngle),
        mustShoot: list(j.mustShoot),
        talkTrack: list(j.talkTrack),
        hooks:
          hooksRaw.length >= 2
            ? [hooksRaw[0]!, hooksRaw[1]!]
            : undefined,
        durationHint: str(j.durationHint),
        deliverables: str(j.deliverables),
        convertAction: str(j.convertAction),
        storeCoop: str(j.storeCoop),
        tabooItems: list(j.tabooItems),
        hashtags: list(j.hashtags),
      }
    } catch {
      return null
    }
  }
  const direct = tryParse(t)
  if (direct) return direct
  const m = t.match(/\{[\s\S]*\}/)
  return m ? tryParse(m[0]) : null
}

/** 达人招募确认第 3 步：生成可执行的拍摄/合作要求（JSON） */
export async function generateRecruitWizardRequirementsAi(args: {
  platformLabel: string
  industry: string
  mainName: string
  priceYuan?: number
  contentFormLabel: string
  city?: string
  storeName?: string
  budgetYuan: number
  headcount: number
  commissionPct: number
  ctx?: KolBriefGenerationContext
  planContext?: string
}): Promise<RecruitWizardRequirementDraft | null> {
  const model = resolveTextAiModelForRequest() as AiModelId
  const menuBlock = args.ctx?.menuSummary
    ? `\n菜单/产品参考（要求须基于真实品项，勿虚构）：\n${args.ctx.menuSummary.slice(0, 1200)}`
    : ''
  const planBlock = args.planContext?.trim()
    ? `\n方案原文（要求须呼应套餐、赠品与达人策略）：\n${args.planContext.trim().slice(0, 3500)}`
    : ''
  const titleDraft = `你是本地生活达人商务。请为达人写一份「合作拍摄要求」，给商家确认后发给达人执行。
平台：${args.platformLabel}
类目：${args.industry}${args.ctx?.industryPath && args.ctx.industryPath !== args.industry ? `（${args.ctx.industryPath}）` : ''}
城市：${args.city || '按门店'}
门店：${args.storeName || args.ctx?.storeName || '未填'}
主推：${args.mainName}
内容形式：${args.contentFormLabel}
计划招募 ${args.headcount} 人（预算与佣金仅供商家内部，禁止写入任何字段）
${menuBlock}${planBlock}

只输出一个 JSON 对象，不要 Markdown。字段：
goal（推广目标，1～2句，写清要卖的团购/核销，不要空话「提升曝光」）
audience（目标人群，1句）
sellingPoints（数组，4～6条必讲卖点，每条15～40字，写体验/场景/团购权益；禁止写招募预算、佣金、档位单价、城市档位参考价、¥报价）
storyAngle（内容切入，2句）
mustShoot（数组，6～8条必拍镜头，写清拍什么、为何要拍）
talkTrack（数组，4～6条口播结构，按开场→体验→卖点→转化）
hooks（数组，2条可直接念的口播钩子，各不超过40字）
durationHint（时长与条数建议，1句）
deliverables（交付物：几条视频、是否封面/图文、是否挂团购，1～2句）
convertAction（转化动作，写清点哪里、引导什么）
storeCoop（到店配合：是否必须到指定门店、是否含套餐体验、如何预约，2句）
tabooItems（数组，4～6条禁忌，结合该类目合规）
hashtags（数组，4～8个话题词，不要#号）
禁止写成无关餐饮模板；禁止医疗疗效承诺；禁止出现招募预算、佣金比例、档位单价或【AI招募方案】。`
  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_article',
    product_name: `达人拍摄要求｜${args.mainName}`,
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) return null
  return parseRequirementDraft(r.description)
}
