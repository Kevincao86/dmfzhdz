/**
 * 将 AI 商品方案 enrich：优化标题/说明、生成头图（无图时）。
 * 用户附图时优先以参考图做图生图优化；无附图时才按门店情报文生图。
 */
import { sanitizeDouyinProductDescriptionCompliance } from '../lib/douyinDescCompliance'
import type { AiProductPlanPreview } from '../lib/aiAgentTypes'
import { inferDouyinProductTypeFromText } from '../lib/aiAgentProductPreviewDefaults'
import { buildProductImageUserLine } from '../lib/douyinProductImageAnchor'
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
}

function pickUserReferenceImage(
  refs: string[],
  planIndex: number,
): string | undefined {
  const clean = refs.map((u) => u.trim()).filter(Boolean)
  if (clean.length === 0) return undefined
  return clean[planIndex % clean.length]
}

export async function enrichAiProductPlanPreview(
  plan: AiProductPlanPreview,
  userBrief: string,
  chatPickerKey?: string,
  opts?: EnrichAiProductPlanOptions,
): Promise<AiProductPlanPreview> {
  const productType = plan.productType ?? inferDouyinProductTypeFromText(`${userBrief} ${plan.productName}`)
  let productName = plan.productName
  let description = plan.description
  let headUrl = plan.headUrl

  const base = { product_name: productName, title_draft: productName }

  try {
    const [titleR, descR] = await Promise.all([
      postDouyinGoodsAiAssist({
        action: 'optimize_title',
        model: resolveModelForAssistAction('optimize_title'),
        ...base,
      }),
      postDouyinGoodsAiAssist({
        action: 'generate_desc',
        model: resolveModelForAssistAction('generate_desc'),
        ...base,
      }),
    ])
    if (titleR.ok && titleR.title) productName = titleR.title.slice(0, 40)
    if (descR.ok && descR.description) {
      description = sanitizeDouyinProductDescriptionCompliance(descR.description)
    }
  } catch {
    /* 保留方案原文案 */
  }

  if (!headUrl?.trim()) {
    const userRefs = opts?.userReferenceImages ?? []
    const refUrl = pickUserReferenceImage(userRefs, opts?.planIndex ?? 0)
    const isVoucher = productType === 2
    const imageUserLine = buildProductImageUserLine(productName, 'head')
    const imageModel = resolveImageAssistModelIdFromChatPicker(chatPickerKey)
    const imageBase = {
      model: imageModel,
      product_name: productName,
      listing_title: productName,
      title_draft: productName,
      price_yuan: String(plan.suggestedPriceYuan),
      origin_yuan: plan.originYuan != null ? String(plan.originYuan) : undefined,
      image_user_line: imageUserLine,
      image_role: 'head' as const,
      goods_product_type: productType,
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
