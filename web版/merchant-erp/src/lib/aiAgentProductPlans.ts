import type { AiProductPlanPreview, AiTaskPreviewPayload } from './aiAgentTypes'

/** 从预览载荷取出全部商品方案（兼容旧版单 productPlan） */
export function listProductPlansFromPreview(
  preview: AiTaskPreviewPayload | undefined,
): AiProductPlanPreview[] {
  if (!preview) return []
  if (preview.productPlans?.length) return preview.productPlans
  if (preview.productPlan) return [preview.productPlan]
  return []
}

export function isProductPreviewLoading(preview: AiTaskPreviewPayload | undefined): boolean {
  const plans = listProductPlansFromPreview(preview)
  if (!plans.length) return false
  return plans.some((p) => p.enrichStatus === 'loading')
}
