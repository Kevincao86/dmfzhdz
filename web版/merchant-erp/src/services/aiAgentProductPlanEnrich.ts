/**
 * 将 AI 商品方案 enrich：优化标题/说明、生成头图（无图时）。
 * 用户附图时优先以参考图做图生图优化；无附图时才按门店情报文生图。
 */
import { sanitizeDouyinProductDescriptionCompliance } from '../lib/douyinDescCompliance'
import type { AiProductPlanPreview } from '../lib/aiAgentTypes'
import { inferDouyinProductTypeFromText } from '../lib/aiAgentProductPreviewDefaults'
import {
  buildImageAssistTextFields,
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
  /** 多商品预览时的序号，用于在参考图池中轮询取图 */
  planIndex?: number
  /** 门店经营类目路径，锁标题/生图业态 */
  industryPath?: string
}

function pickUserReferenceImage(
  refs: string[],
  planIndex: number,
): string | undefined {
  const clean = refs.map((u) => u.trim()).filter(Boolean)
  if (clean.length === 0) return undefined
  return clean[planIndex % clean.length]
}

/** 标题/生图锚点：优先套餐项与 slot 标签，避免门店名营销词盖过真实商品 */
export function resolveProductTitleAnchor(plan: AiProductPlanPreview): string {
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
  const industryLock = buildIndustryLock(opts?.industryPath, typeLabel)
  const imageFields = buildImageAssistTextFields(titleAnchor, plan.description, {
    productType,
    productTypeLabel: typeLabel,
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
    const refUrl = pickUserReferenceImage(userRefs, opts?.planIndex ?? 0)
    const isVoucher = productType === 2
    const imageAnchor = imageFields.main_product_heuristic || titleAnchor
    const categoryHint = mainProductCategoryHints(imageAnchor, {
      isVoucher,
      isGroupBuy: !isVoucher,
    })
    const imageUserLine = `帮我生成一张${imageAnchor}主图。${categoryHint}禁止生成与商品无关的动物、吉祥物或门店 mascots 替代实物。`
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
      if (refUrl && !isVoucher) {
        const imgR = await postDouyinGoodsAiAssist({
          action: 'image_enhance',
          ...imageBase,
          image_urls: [refUrl],
        })
        if (imgR.ok && imgR.image_urls?.[0]) headUrl = imgR.image_urls[0]
        else headUrl = refUrl
      } else {
        const imgR = await postDouyinGoodsAiAssist({
          action: 'image_generate',
          ...imageBase,
        })
        if (imgR.ok && imgR.image_urls?.[0]) headUrl = imgR.image_urls[0]
      }
    } catch {
      if (refUrl && !isVoucher) headUrl = refUrl
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
