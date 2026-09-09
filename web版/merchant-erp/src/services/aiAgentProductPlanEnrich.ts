/**
 * 将 AI 商品方案 enrich：优化标题/说明、生成头图（无图时）。
 * 参考图优先级：用户附图 > 绑定平台在售商品图（有图）> 按门店情报文生图。
 */
import { inferIndustryPathFromText } from '../lib/merchantIndustryAlign'
import { sanitizeDouyinProductDescriptionCompliance } from '../lib/douyinDescCompliance'
import type { AiProductPlanPreview } from '../lib/aiAgentTypes'
import { inferDouyinProductTypeFromText } from '../lib/aiAgentProductPreviewDefaults'
import {
  buildImageAssistTextFields,
  goodsImageIndustryLockSuffix,
  inferIndustryVisualCategory,
  looksLikeFoodListingName,
  mainProductCategoryHints,
} from '../lib/douyinProductImageAnchor'
import { postDouyinGoodsAiAssist } from './douyinAiAssistApi'
import {
  resolveImageAssistModelIdFromChatPicker,
  resolveModelForAssistAction,
} from './merchantAiModelStorage'
import { postAiChat } from './ai/aiClient'
import { effectiveChatPickerKey } from './ai/agentImageModelKeys'
import { defaultModelIdForFamily, parseAiModelPickerKey } from './ai/modelRegistry'
import {
  intentsFromExtractedPackages,
  type CreateProductIntent,
} from '../lib/aiAgentActionParse'

export type EnrichAiProductPlanOptions = {
  /** 用户消息附带的参考图（data URL），优先用于头图 */
  userReferenceImages?: string[]
  /** 绑定平台在售商品主图（有图才收录）；无用户附图时作参考 */
  boundProductImages?: { name: string; imageUrl: string }[]
  /** 多商品预览时的序号，用于在参考图池中轮询取图 */
  planIndex?: number
  /** 门店经营类目路径，锁标题/生图业态 */
  industryPath?: string
  /** 门店名，辅助锁定足浴等业态 */
  storeName?: string
}

function pickUserReferenceImage(
  refs: string[],
  planIndex: number,
): string | undefined {
  const clean = refs.map((u) => u.trim()).filter(Boolean)
  if (clean.length === 0) return undefined
  return clean[planIndex % clean.length]
}

const BOUND_IMAGE_MATCH_MIN = 6

const WELLNESS_RE = /足浴|足疗|足道|沐足|采耳|修脚|按摩|开背|推拿|汗蒸|洗浴|养生馆|SPA|spa/
const FOOD_ADDON_RE =
  /捞面|面条|汤面|米粉|米线|盖浇|炒饭|米饭|暖胃面|小吃|夜宵|小食|火锅|烧烤|美食|海鲜|奶茶|咖啡|蛋糕|披萨|汉堡|寿司|菜品|炒菜|凉菜|热菜|主食|甜品|自助餐/

type PlanTextFields = Pick<
  AiProductPlanPreview,
  'productName' | 'comboLines' | 'slotLabel' | 'description'
>

function planTextBlob(plan: PlanTextFields, storeName?: string): string {
  return [storeName, plan.slotLabel, plan.productName, plan.description, ...(plan.comboLines ?? [])]
    .filter(Boolean)
    .join(' ')
}

function looksLikeFoodNameStrict(name: string): boolean {
  return looksLikeFoodListingName(name) || FOOD_ADDON_RE.test(name)
}

/** 方案/门店文案一旦出现足疗等词，生图类目不得再跟餐饮接口默认走 */
export function resolvePlanIndustryPath(
  apiPath: string | undefined,
  plan: PlanTextFields,
  storeName?: string,
): { path: string; visual: ReturnType<typeof inferIndustryVisualCategory> } {
  const blob = planTextBlob(plan, storeName)
  const fromPlan = inferIndustryVisualCategory('', blob)
  const fromApi = inferIndustryVisualCategory(apiPath, apiPath)
  const visual =
    fromPlan === 'wellness' || fromPlan === 'beauty' || fromPlan === 'digital'
      ? fromPlan
      : fromApi === 'wellness' || fromApi === 'beauty' || fromApi === 'digital'
        ? fromApi
        : fromPlan !== 'general'
          ? fromPlan
          : fromApi
  if (visual === 'wellness') {
    return { path: inferIndustryPathFromText(blob) || '休闲娱乐 > 足疗足浴', visual }
  }
  if (visual === 'beauty') {
    return { path: inferIndustryPathFromText(blob) || apiPath || '丽人 > 美容美体', visual }
  }
  if (visual === 'digital') {
    return { path: (fromApi === 'digital' && apiPath) || inferIndustryPathFromText(blob) || apiPath || '', visual }
  }
  if (visual === 'catering') {
    return { path: (fromApi === 'catering' && apiPath) || '餐饮 > 美食', visual }
  }
  return { path: apiPath || inferIndustryPathFromText(blob) || '', visual }
}

function boundNameCompatibleWithPlan(
  boundName: string,
  planVisual: ReturnType<typeof inferIndustryVisualCategory>,
): boolean {
  if (planVisual === 'wellness') return WELLNESS_RE.test(boundName)
  if (planVisual === 'beauty') return /美容|美发|美甲|美睫|丽人|护理/.test(boundName)
  if (planVisual === 'digital') return /数码|3C|手机|耳机|平板|投影|电脑/.test(boundName)
  if (planVisual === 'catering') return looksLikeFoodNameStrict(boundName) || /餐|锅|菜|宴|饮/.test(boundName)
  return !looksLikeFoodNameStrict(boundName)
}

/** 按套餐名/套餐项匹配绑定平台在售商品图；足疗等非餐饮禁止用菜品图，也禁止「国庆/双人」泛词误配 */
export function pickBoundProductReferenceImage(
  plan: PlanTextFields,
  refs: { name: string; imageUrl: string }[],
  opts?: { rejectFood?: boolean; requireStrongMatch?: boolean; planVisual?: ReturnType<typeof inferIndustryVisualCategory> },
): { url: string; score: number } | undefined {
  const planVisual = opts?.planVisual ?? inferIndustryVisualCategory('', planTextBlob(plan))
  const rejectFood = opts?.rejectFood ?? planVisual !== 'catering'
  const requireStrongMatch = opts?.requireStrongMatch ?? planVisual !== 'catering'
  const clean = refs
    .map((r) => ({ name: r.name.trim(), url: r.imageUrl.trim() }))
    .filter((r) => r.name && /^https?:\/\//i.test(r.url))
    .filter((r) => !(rejectFood && looksLikeFoodNameStrict(r.name)))
    .filter((r) => boundNameCompatibleWithPlan(r.name, planVisual))
  if (!clean.length) return undefined
  const anchor = resolveProductTitleAnchor(plan)
  const tokens = [
    ...significantProductTokens(anchor),
    ...significantProductTokens(plan.productName || ''),
    ...plan.comboLines.flatMap((line) => significantProductTokens(line)),
  ].filter((t) => (planVisual === 'wellness' ? !FOOD_ADDON_RE.test(t) : true))
  let best: { url: string; score: number } | undefined
  for (const r of clean) {
    let score = 0
    const name = r.name
    const substance = significantProductTokens(name)
    if (anchor.length >= 6 && (name.includes(anchor.slice(0, 6)) || anchor.includes(name.slice(0, 6)))) {
      score += 12
    }
    for (const t of tokens) {
      if (t.length >= 2 && name.includes(t)) score += Math.min(8, t.length)
    }
    if (planVisual === 'wellness' && WELLNESS_RE.test(name)) score += 8
    if (substance.some((t) => tokens.includes(t) && t.length >= 3)) score += 4
    if (!best || score > best.score) best = { url: r.url, score }
  }
  if (best && best.score >= BOUND_IMAGE_MATCH_MIN) return best
  if (requireStrongMatch) return undefined
  return { url: clean[0]!.url, score: 0 }
}

function wellnessPhraseFromText(text: string): string | undefined {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  const m = t.match(/(?:足浴|足疗|足道|沐足|采耳|按摩|开背|推拿|汗蒸|洗浴|SPA)[^，。；、\n!！]{0,18}/i)
  return m?.[0]?.trim().slice(0, 48) || undefined
}

/**
 * 养生/美业主图：强制豆包 Seedream。
 * 通义万相（wanx / wan2.7）食品摄影先验极强，「套餐/体验/国庆」常被画成面食火锅，负向提示经常被忽略。
 */
function resolveProductPlanImageVendor(
  visualCategory: ReturnType<typeof inferIndustryVisualCategory>,
  chatPickerKey?: string,
): string {
  if (visualCategory === 'wellness' || visualCategory === 'beauty') return 'doubao'
  return resolveImageAssistModelIdFromChatPicker(chatPickerKey)
}

/** 标题/生图锚点：足疗套餐优先服务项，避免营销名「畅享套餐」把模型画成餐饮 */
export function resolveProductTitleAnchor(plan: PlanTextFields): string {
  const combo = plan.comboLines
    .map((line) => line.replace(/[×x]\s*\d+$/i, '').trim())
    .filter(Boolean)
  const wellnessCombo = combo.filter((line) => WELLNESS_RE.test(line))
  const comboPick = (wellnessCombo.length ? wellnessCombo : combo).slice(0, 2)
  if (comboPick.length) {
    const core = comboPick.join('+')
    return core.slice(0, 48)
  }
  const fromDesc = wellnessPhraseFromText(plan.description || '')
  if (fromDesc) return fromDesc
  if (WELLNESS_RE.test(plan.productName || '')) return plan.productName.trim().slice(0, 48)
  if (plan.slotLabel?.trim()) return plan.slotLabel.trim().slice(0, 48)
  return plan.productName.trim().slice(0, 48)
}

function significantProductTokens(text: string): string[] {
  const raw = text.match(/[\u4e00-\u9fa5a-zA-Z0-9]{2,}/g) ?? []
  const noise =
    /^(套餐|组合|引流|爆品|利润|毛利|福利|主推|高毛利|到店|商品|方案|数字|数码|特惠|清凉|夏日|国庆|双人|家庭|深夜|畅享|解压|分钟|体验|团建|节日|超值|暖胃|自愈|舒压|焕新|专享|限时|GO|go)$/i
  return raw.filter((t) => !noise.test(t))
}

function titlePreservesProductAnchor(optimized: string, anchor: string): boolean {
  const tokens = significantProductTokens(anchor)
  if (tokens.length === 0) return true
  const hits = tokens.filter((t) => optimized.includes(t)).length
  if (hits >= Math.min(2, tokens.length)) return true
  return hits / tokens.length >= 0.5
}

function buildIndustryLock(industryPath?: string, productTypeLabel?: string) {
  const path = industryPath?.trim()
  if (!path) return { goods_product_type_label: productTypeLabel }
  return {
    goods_category_path_zh: path,
    goods_product_type_label: productTypeLabel,
  }
}

export async function enrichAiProductPlanPreview(
  plan: AiProductPlanPreview,
  userBrief: string,
  chatPickerKey?: string,
  opts?: EnrichAiProductPlanOptions,
): Promise<AiProductPlanPreview> {
  const productType = plan.productType ?? inferDouyinProductTypeFromText(`${userBrief} ${plan.productName}`)
  const titleAnchor = resolveProductTitleAnchor(plan)
  let productName = plan.productName.trim() || titleAnchor
  let description = plan.description
  let headUrl = plan.headUrl

  const typeLabel = productType === 2 ? '代金券' : '团购套餐'
  const apiPath = opts?.industryPath?.trim()
  const { path: industryPath, visual: visualCategory } = resolvePlanIndustryPath(
    apiPath,
    plan,
    [opts?.storeName, userBrief.slice(0, 240)].filter(Boolean).join(' '),
  )
  const nonCatering = visualCategory !== 'catering'
  const industryLock = buildIndustryLock(industryPath, typeLabel)
  const imageFields = buildImageAssistTextFields(titleAnchor, plan.description, {
    productType,
    productTypeLabel: typeLabel,
    industryPath,
  })
  const imageAnchor =
    visualCategory === 'wellness'
      ? wellnessPhraseFromText(titleAnchor) ||
        wellnessPhraseFromText(plan.productName) ||
        wellnessPhraseFromText(plan.description || '') ||
        titleAnchor
      : imageFields.main_product_heuristic || titleAnchor

  const assistBase = {
    product_name: titleAnchor,
    title_draft: `${titleAnchor}${plan.comboLines.length ? `\n套餐项：${plan.comboLines.join('、')}` : ''}`,
    listing_title: titleAnchor,
    main_product_heuristic: imageFields.main_product_heuristic,
    goods_product_type: productType,
    ...industryLock,
  }

  try {
    const [titleR, descR] = await Promise.all([
      postDouyinGoodsAiAssist({
        action: 'optimize_title',
        model: resolveModelForAssistAction('optimize_title'),
        ...assistBase,
      }),
      postDouyinGoodsAiAssist({
        action: 'generate_desc',
        model: resolveModelForAssistAction('generate_desc'),
        product_name: titleAnchor,
        title_draft: titleAnchor,
        ...industryLock,
      }),
    ])
    if (titleR.ok && titleR.title) {
      const optimized = titleR.title.slice(0, 40)
      productName = titlePreservesProductAnchor(optimized, titleAnchor)
        ? optimized
        : titleAnchor.slice(0, 40)
    } else {
      productName = titleAnchor.slice(0, 40)
    }
    if (descR.ok && descR.description) {
      description = sanitizeDouyinProductDescriptionCompliance(descR.description)
    }
  } catch {
    productName = titleAnchor.slice(0, 40)
  }

  if (!headUrl?.trim()) {
    const userRefs = opts?.userReferenceImages ?? []
    const userRefUrl = pickUserReferenceImage(userRefs, opts?.planIndex ?? 0)
    const boundMatch = userRefUrl
      ? undefined
      : pickBoundProductReferenceImage(plan, opts?.boundProductImages ?? [], {
          rejectFood: nonCatering,
          requireStrongMatch: true,
          planVisual: visualCategory,
        })
    const strongBoundMatch = Boolean(boundMatch && boundMatch.score >= BOUND_IMAGE_MATCH_MIN)
    const refUrl = userRefUrl || (strongBoundMatch ? boundMatch?.url : undefined)
    const isVoucher = productType === 2
    const categoryHint = mainProductCategoryHints(imageAnchor, {
      isVoucher,
      isGroupBuy: !isVoucher,
      industryPath,
    })
    const industryLockLine = industryPath ? `经营类目：${industryPath}。` : ''
    const boundHint =
      refUrl && !userRefUrl
        ? '画面须贴近参考图中的真实到店服务或门店空间，禁止改成餐饮菜品。'
        : ''
    const foodBan = nonCatering
      ? '【严禁餐饮错配】禁止出现菜品、餐桌摆盘、火锅海鲜、冒菜、麻辣烫、面食特写、炒面、饮品特写等美食摄影。画面里不能有碗、筷子、汤汁、食物。'
      : ''
    const wellnessLead =
      visualCategory === 'wellness'
        ? '帮我生成一张到店足疗养生团购主图，主体必须是足浴沙发/足疗椅、足浴桶或技师按摩足部场景，室内养生馆灯光，绝不是餐馆也不是任何食物，'
        : `帮我生成一张${imageAnchor}主图。`
    const modelLock = goodsImageIndustryLockSuffix(industryPath)
    const imageUserLine = `${wellnessLead}${visualCategory === 'wellness' ? `内容：${imageAnchor}。` : ''}${industryLockLine}${boundHint}${categoryHint}${foodBan}${modelLock}`
    const imageModel = resolveProductPlanImageVendor(visualCategory, chatPickerKey)
    const imageBase = {
      model: imageModel,
      product_name: imageAnchor,
      listing_title: imageAnchor,
      title_draft: imageFields.title_draft,
      main_product_heuristic: imageAnchor,
      price_yuan: String(plan.suggestedPriceYuan),
      origin_yuan: plan.originYuan != null ? String(plan.originYuan) : undefined,
      image_user_line: imageUserLine,
      image_role: 'head' as const,
      goods_product_type: productType,
      ...industryLock,
    }

    try {
      /** 仅用户附图或「同业态强匹配」的在售图可修图；禁止拿第一张菜品图当底图 */
      if (refUrl && !isVoucher && (userRefUrl || strongBoundMatch)) {
        const imgR = await postDouyinGoodsAiAssist({
          action: 'image_enhance',
          ...imageBase,
          image_urls: [refUrl],
        })
        if (imgR.ok && imgR.image_urls?.[0]) headUrl = imgR.image_urls[0]
        else if (userRefUrl || strongBoundMatch) headUrl = refUrl
      }
      if (!headUrl?.trim()) {
        if (!industryPath) {
          /* 类目未解析到：禁止盲目文生图 */
        } else {
          const imgR = await postDouyinGoodsAiAssist({
            action: 'image_generate',
            ...imageBase,
          })
          if (imgR.ok && imgR.image_urls?.[0]) headUrl = imgR.image_urls[0]
        }
      }
    } catch {
      if ((userRefUrl || strongBoundMatch) && refUrl && !isVoucher) headUrl = refUrl
    }
  }

  return {
    ...plan,
    productName,
    description,
    headUrl,
    productType,
    enrichStatus: 'ready',
  }
}

const EXTRACT_COMBO_SYSTEM = `你是抖音来客组品审核员。先完整阅读方案，只提取「组品/套餐/团购商品」板块里、可上架给顾客购买的具体套餐。

必须排除，不得输出：
- 准备阶段、宣传阶段、执行阶段、落地/预热/复盘
- 拍摄、装饰、短视频素材、门店布置、达人招募、预算、排期、直播
- 工作待办（如「制作节日主题装饰，拍摄短视频素材，设计套餐」）
- 目标口号、策略标题

只输出 JSON：
{"packages":[{"name":"顾客可见的套餐名","priceYuan":数字或省略,"comboHint":"包含项目一句"}]}
没有可上架套餐时 packages 为 []。最多 6 项。name 不能是阶段名或待办句。`

function parseExtractedPackagesJson(
  content: string,
): { name: string; priceYuan?: number; comboHint?: string }[] | null {
  const t = content.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced?.[1] ?? t).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as {
      packages?: unknown
      items?: unknown
      combos?: unknown
    }
    const arr = obj.packages ?? obj.items ?? obj.combos
    if (!Array.isArray(arr)) return null
    const rows: { name: string; priceYuan?: number; comboHint?: string }[] = []
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      const r = item as Record<string, unknown>
      const name = String(r.name ?? r.title ?? r.productName ?? r.label ?? '').trim()
      if (!name) continue
      const priceRaw = r.priceYuan ?? r.price ?? r.suggestedPriceYuan
      const priceYuan =
        typeof priceRaw === 'number'
          ? priceRaw
          : typeof priceRaw === 'string'
            ? Number.parseFloat(priceRaw)
            : undefined
      const comboHint = String(r.comboHint ?? r.items ?? r.comboLines ?? '').trim()
      rows.push({
        name,
        ...(priceYuan != null && Number.isFinite(priceYuan) && priceYuan > 0 ? { priceYuan } : {}),
        ...(comboHint ? { comboHint } : {}),
      })
    }
    return rows
  } catch {
    return null
  }
}

/** 让模型先回读方案，只抽出组品板块中的可上架套餐 */
export async function extractComboIntentsFromPlanByAi(opts: {
  userBrief: string
  assistantContent?: string
  modelPickerKey?: string
}): Promise<CreateProductIntent[] | null> {
  const planText = [opts.assistantContent, opts.userBrief]
    .map((s) => s?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
  if (planText.length < 40) return null

  const chatKey = effectiveChatPickerKey(opts.modelPickerKey ?? '')
  const parsed = parseAiModelPickerKey(chatKey)
  const provider = parsed?.provider ?? 'qwen'
  let model = parsed && 'model' in parsed ? parsed.model : ''
  const modelFamily = parsed && parsed.provider === 'tokenmix' ? parsed.modelFamily : undefined
  if (provider === 'tokenmix' && !model && modelFamily) {
    model = defaultModelIdForFamily(modelFamily)
  }

  const res = await postAiChat({
    provider,
    model: model || undefined,
    ...(provider === 'tokenmix' && modelFamily ? { modelFamily } : {}),
    stream: false,
    temperature: 0.1,
    taskType: 'create_product',
    agentPickerKey: opts.modelPickerKey,
    messages: [
      { role: 'system', content: EXTRACT_COMBO_SYSTEM },
      {
        role: 'user',
        content: `商家诉求：\n${opts.userBrief.slice(0, 1200)}\n\n方案全文（请先通读，只提取组品板块）：\n${planText.slice(0, 8000)}`,
      },
    ],
  })
  const rows = parseExtractedPackagesJson(res.content ?? '')
  if (!rows?.length) return null
  const intents = intentsFromExtractedPackages(planText, rows)
  return intents.length ? intents : null
}
