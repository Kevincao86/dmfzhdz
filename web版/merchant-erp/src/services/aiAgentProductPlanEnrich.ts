/**
 * 将 AI 商品方案 enrich：优化标题/说明、生成头图（无图时）。
 */
import { sanitizeDouyinProductDescriptionCompliance } from '../lib/douyinDescCompliance'
import type { AiProductPlanPreview } from '../lib/aiAgentTypes'
import { inferDouyinProductTypeFromText } from '../lib/aiAgentProductPreviewDefaults'
import { buildProductImageUserLine } from '../lib/douyinProductImageAnchor'
import { postDouyinGoodsAiAssist } from './douyinAiAssistApi'
import { resolveModelForAssistAction, resolveImageAssistModelId } from './merchantAiModelStorage'

export async function enrichAiProductPlanPreview(
  plan: AiProductPlanPreview,
  userBrief: string,
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
    try {
      const imageUserLine = buildProductImageUserLine(productName, 'head')
      const imgR = await postDouyinGoodsAiAssist({
        action: 'image_generate',
        model: resolveImageAssistModelId(),
        product_name: productName,
        listing_title: productName,
        price_yuan: String(plan.suggestedPriceYuan),
        origin_yuan: plan.originYuan != null ? String(plan.originYuan) : undefined,
        image_user_line: imageUserLine,
        image_role: 'head',
      })
      if (imgR.ok && imgR.image_urls?.[0]) headUrl = imgR.image_urls[0]
    } catch {
      /* 无图时预览仍展示占位 */
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
