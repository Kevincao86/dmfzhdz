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

const BOUND_IMAGE_MATCH_MIN = 4

/** 按套餐名/套餐项匹配绑定平台在售商品图；无强匹配时仅餐饮业态才退回第一张 */
export function pickBoundProductReferenceImage(
  plan: Pick<AiProductPlanPreview, 'productName' | 'comboLines' | 'slotLabel'>,
  refs: { name: string; imageUrl: string }[],
  opts?: { rejectFood?: boolean; requireStrongMatch?: boolean },
): { url: string; score: number } | undefined {
  const clean = refs
    .map((r) => ({ name: r.name.trim(), url: r.imageUrl.trim() }))
    .filter((r) => r.name && /^https?:\/\//i.test(r.url))
    .filter((r) => !(opts?.rejectFood && looksLikeFoodListingName(r.name)))
  if (!clean.length) return undefined
  const anchor = resolveProductTitleAnchor(plan)
  const tokens = [
    ...significantProductTokens(anchor),
    ...significantProductTokens(plan.productName || ''),
    ...plan.comboLines.flatMap((line) => significantProductTokens(line)),
  ]
  let best: { url: string; score: number } | undefined
  for (const r of clean) {
    let score = 0
    const name = r.name
    if (anchor && (name.includes(anchor.slice(0, 4)) || anchor.includes(name.slice(0, 4)))) {
      score += 10
    }
    for (const t of tokens) {
      if (t.length >= 2 && name.includes(t)) score += Math.min(8, t.length)
    }
    if (!best || score > best.score) best = { url: r.url, score }
  }
  if (best && best.score >= BOUND_IMAGE_MATCH_MIN) return best
  if (opts?.requireStrongMatch) return undefined
  return { url: clean[0]!.url, score: 0 }
}

/** 标题/生图锚点：优先套餐项与 slot 标签，避免门店名营销词盖过真实商品 */
export function resolveProductTitleAnchor(
  plan: Pick<AiProductPlanPreview, 'productName' | 'comboLines' | 'slotLabel'>,
): string {
  const combo = plan.comboLines
    .map((line) => line.replace(/[×x]\s*\d+$/i, '').trim())
    .filter(Boolean)
  if (combo.length) {
    const core = combo.slice(0, 3).join('+')
    const tag = plan.slotLabel?.trim()
    if (tag && tag.length >= 2 && !core.includes(tag.slice(0, 6))) {
      return `${tag} ${core}`.slice(0, 48)
    }
    return core.slice(0, 48)
  }
  if (plan.slotLabel?.trim()) return plan.slotLabel.trim().slice(0, 48)
  return plan.productName.trim().slice(0, 48)
}

function significantProductTokens(text: string): string[] {
  const raw = text.match(/[\u4e00-\u9fa5a-zA-Z0-9]{2,}/g) ?? []
  const noise =
    /^(套餐|组合|引流|爆品|利润|毛利|福利|主推|高毛利|到店|商品|方案|数字|数码|特惠|清凉|夏日|GO|go)$/i
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
  const visualCategory = inferIndustryVisualCategory(apiPath, `${opts?.storeName ?? ''} ${titleAnchor}`)
  const inferredPath = inferIndustryPathFromText([apiPath, opts?.storeName, titleAnchor].filter(Boolean).join(' '))
  const industryPath =
    apiPath ||
    (visualCategory === 'wellness'
      ? inferredPath || '休闲娱乐 > 足疗足浴'
      : inferredPath)
  const nonCatering = inferIndustryVisualCategory(industryPath, titleAnchor) !== 'catering'
  const industryLock = buildIndustryLock(industryPath, typeLabel)
  const imageFields = buildImageAssistTextFields(titleAnchor, plan.description, {
    productType,
    productTypeLabel: typeLabel,
    industryPath,
  })

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
          requireStrongMatch: nonCatering,
        })
    const refUrl = userRefUrl || boundMatch?.url
    const strongBoundMatch = Boolean(boundMatch && boundMatch.score >= BOUND_IMAGE_MATCH_MIN)
    const isVoucher = productType === 2
    const imageAnchor = imageFields.main_product_heuristic || titleAnchor
    const categoryHint = mainProductCategoryHints(imageAnchor, {
      isVoucher,
      isGroupBuy: !isVoucher,
      industryPath,
    })
    const industryLockLine = industryPath
      ? `经营类目：${industryPath}。`
      : ''
    const boundHint = refUrl && !userRefUrl
      ? nonCatering
        ? '画面须贴近参考图中的真实到店服务或门店空间，禁止改成餐饮菜品。'
        : '画面主体、品类、器皿与摆盘须贴近参考图中的真实在售商品，禁止换成其它品类。'
      : ''
    const foodBan = nonCatering
      ? '【严禁餐饮错配】禁止出现菜品、餐桌摆盘、火锅海鲜、饮品特写等美食摄影。'
      : ''
    const modelLock = goodsImageIndustryLockSuffix(industryPath)
    const imageUserLine = `帮我生成一张${imageAnchor}主图。${industryLockLine}${boundHint}${categoryHint}${foodBan}${modelLock}`
    const imageModel = resolveImageAssistModelIdFromChatPicker(chatPickerKey)
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
      if (refUrl && !isVoucher && (userRefUrl || industryPath)) {
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
          /* 类目未从绑定门店接口解析到：禁止盲目文生图 */
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
