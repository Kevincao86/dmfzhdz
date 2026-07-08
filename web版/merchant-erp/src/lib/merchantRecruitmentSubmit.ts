import { appendRecruitmentOrderToOps, appendMpRecruitmentOrderToOps, patchRecruitmentOrderOnOps } from './opsRegistryClient'
import {
  buildMpOrderFromMerchantRecruitment,
  buildMpOrderFromProRecruitment,
  type ProMpPublishExtras,
} from './merchantMpAutoPublish'
import type { RecruitmentTierPlan } from './merchantRecruitmentTierPlan'
import type { RegistryMpRecruitmentOrder, RegistryRecruitmentOrder } from './opsRegistryTypes'

async function linkMpOrderAfterAppend(
  enriched: RegistryRecruitmentOrder,
  mpOrder: RegistryMpRecruitmentOrder,
): Promise<{ orderId: string; mpOrderId: string }> {
  const append = await appendMpRecruitmentOrderToOps(mpOrder)
  if (!append.ok) {
    if (append.error === 'duplicate_merchant_order' && append.existingId) {
      await patchRecruitmentOrderOnOps({
        id: enriched.id,
        linkedMpOrderId: append.existingId,
        workflowStage: 'recruiting',
        status: 'accepted',
        acceptMode: 'miniprogram',
      })
      return { orderId: enriched.id, mpOrderId: append.existingId }
    }
    throw new Error(append.error ?? '发布星选招募单失败')
  }

  await patchRecruitmentOrderOnOps({
    id: enriched.id,
    linkedMpOrderId: mpOrder.id,
    workflowStage: 'recruiting',
    status: 'accepted',
    acceptMode: 'miniprogram',
    recruitmentPlatform: enriched.recruitmentPlatform,
  })

  return { orderId: enriched.id, mpOrderId: mpOrder.id }
}

/** 商家提单 + 自动发布星选招募大厅 */
export async function submitMerchantRecruitmentWithMpPublish(
  order: RegistryRecruitmentOrder,
  tierPlan?: RecruitmentTierPlan,
  mpOrderOverride?: RegistryMpRecruitmentOrder,
): Promise<{ orderId: string; mpOrderId: string }> {
  const enriched: RegistryRecruitmentOrder = {
    ...order,
    fulfillmentLoop: order.fulfillmentLoop ?? 'open',
    orderKind: order.orderKind ?? 'recruitment',
    autoPublishMp: true,
    workflowStage: 'submitted',
    tierPlan: tierPlan ?? order.tierPlan,
    acceptMode: 'miniprogram',
    status: 'accepted',
  }

  await appendRecruitmentOrderToOps(enriched)

  const resolvedTierPlan = (tierPlan ?? enriched.tierPlan) as RecruitmentTierPlan | undefined
  const mpOrder =
    mpOrderOverride ?? buildMpOrderFromMerchantRecruitment(enriched, resolvedTierPlan)
  return linkMpOrderAfterAppend(enriched, mpOrder)
}

/** 专业版普通招募：表单与星选一致，发布至星选招募大厅 */
export async function submitProGeneralRecruitmentToXingxuan(
  order: RegistryRecruitmentOrder,
  extras: ProMpPublishExtras,
): Promise<{ orderId: string; mpOrderId: string }> {
  const enriched: RegistryRecruitmentOrder = {
    ...order,
    fulfillmentLoop: 'open',
    orderKind: 'recruitment',
    autoPublishMp: true,
    workflowStage: 'submitted',
    acceptMode: 'miniprogram',
    status: 'accepted',
    recruitmentPlatform: order.recruitmentPlatform,
  }
  const mpOrder = buildMpOrderFromProRecruitment(enriched, extras)
  await appendRecruitmentOrderToOps(enriched)
  return linkMpOrderAfterAppend(enriched, mpOrder)
}
