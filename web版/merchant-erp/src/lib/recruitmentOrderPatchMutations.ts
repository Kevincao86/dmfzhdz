import { deleteMpRecruitmentOrdersFromSnapshot } from './mpRecruitmentOrderRegistryMutations.js'
import type {
  RecruitmentCpsLinkage,
  RegistryRecruitmentOrder,
  RegistrySnapshot,
} from './opsRegistryTypes'

export type RecruitmentOrderPatchBody = {
  id?: string
  status?: RegistryRecruitmentOrder['status']
  acceptMode?: RegistryRecruitmentOrder['acceptMode']
  linkedMpOrderId?: string
  recruitmentPlatform?: RegistryRecruitmentOrder['recruitmentPlatform']
  workflowStage?: RegistryRecruitmentOrder['workflowStage']
  tierPlan?: RegistryRecruitmentOrder['tierPlan']
  scheduleMeta?: RegistryRecruitmentOrder['scheduleMeta']
  paymentState?: RegistryRecruitmentOrder['paymentState']
  fulfillmentLoop?: RegistryRecruitmentOrder['fulfillmentLoop']
  autoPublishMp?: boolean
  orderKind?: RegistryRecruitmentOrder['orderKind']
  cpsLinkage?: RecruitmentCpsLinkage
  /** 商家 ERP 删除招募单：同时删除星选大厅对应 mp 单 */
  delete?: boolean
}

function collectLinkedXingxuanOrderIds(data: RegistrySnapshot, merchantOrderId: string): string[] {
  const ids = new Set<string>()
  const merchant = (data.recruitmentOrders ?? []).find((o) => o && o.id === merchantOrderId)
  const linked = String(merchant?.linkedMpOrderId || '').trim()
  if (linked) ids.add(linked)
  for (const mp of data.mpRecruitmentOrders ?? []) {
    if (!mp?.id) continue
    if (String(mp.sourceMerchantOrderId || '').trim() === merchantOrderId) ids.add(mp.id)
  }
  return [...ids]
}

export function deleteRecruitmentOrderInSnapshot(
  data: RegistrySnapshot,
  rawId: string,
): { ok: true; deletedMpIds: string[] } | { ok: false; error: string; status: number } {
  const id = String(rawId || '').trim()
  if (!id) return { ok: false, error: 'invalid_delete', status: 400 }
  const list = data.recruitmentOrders ?? []
  if (!list.some((o) => o && o.id === id)) {
    return { ok: false, error: 'not_found', status: 404 }
  }

  const mpIds = collectLinkedXingxuanOrderIds(data, id)
  let deletedMpIds: string[] = []
  if (mpIds.length) {
    const mpResult = deleteMpRecruitmentOrdersFromSnapshot(data, mpIds)
    if (mpResult.ok) deletedMpIds = mpResult.deletedIds
  }

  data.recruitmentOrders = (data.recruitmentOrders ?? []).filter((o) => o && o.id !== id)
  return { ok: true, deletedMpIds }
}

export function patchRecruitmentOrderInSnapshot(
  data: RegistrySnapshot,
  body: RecruitmentOrderPatchBody,
): { ok: true; deletedMpIds?: string[] } | { ok: false; error: string; status: number } {
  const id = (body.id ?? '').trim()
  if (!id) return { ok: false, error: 'invalid_patch', status: 400 }

  if (body.delete === true) {
    return deleteRecruitmentOrderInSnapshot(data, id)
  }

  const status = body.status
  const okStatus =
    status === undefined ||
    status === 'pending' ||
    status === 'accepted' ||
    status === 'done' ||
    status === 'cancelled' ||
    status === 'refunded'
  if (!okStatus) return { ok: false, error: 'invalid_patch', status: 400 }

  const idx = data.recruitmentOrders?.findIndex((o) => o.id === id) ?? -1
  if (!data.recruitmentOrders || idx < 0) {
    return { ok: false, error: 'not_found', status: 404 }
  }

  const cur = data.recruitmentOrders[idx]!
  data.recruitmentOrders[idx] = {
    ...cur,
    ...(status !== undefined ? { status } : {}),
    ...(body.acceptMode === 'manual' ||
    body.acceptMode === 'miniprogram' ||
    body.acceptMode === 'ice'
      ? { acceptMode: body.acceptMode }
      : {}),
    ...(typeof body.linkedMpOrderId === 'string' && body.linkedMpOrderId.trim()
      ? { linkedMpOrderId: body.linkedMpOrderId.trim() }
      : {}),
    ...(body.recruitmentPlatform &&
    (body.recruitmentPlatform === '抖音' ||
      body.recruitmentPlatform === '小红书' ||
      body.recruitmentPlatform === '大众点评' ||
      body.recruitmentPlatform === '快手' ||
      body.recruitmentPlatform === '微信视频号')
      ? { recruitmentPlatform: body.recruitmentPlatform }
      : {}),
    ...(body.workflowStage ? { workflowStage: body.workflowStage } : {}),
    ...(body.tierPlan ? { tierPlan: body.tierPlan } : {}),
    ...(body.scheduleMeta ? { scheduleMeta: { ...cur.scheduleMeta, ...body.scheduleMeta } } : {}),
    ...(body.paymentState ? { paymentState: body.paymentState } : {}),
    ...(body.fulfillmentLoop === 'open' || body.fulfillmentLoop === 'closed'
      ? { fulfillmentLoop: body.fulfillmentLoop }
      : {}),
    ...(typeof body.autoPublishMp === 'boolean' ? { autoPublishMp: body.autoPublishMp } : {}),
    ...(body.orderKind === 'recruitment' || body.orderKind === 'recruitment_ice'
      ? { orderKind: body.orderKind }
      : {}),
    ...(body.cpsLinkage ? { cpsLinkage: { ...cur.cpsLinkage, ...body.cpsLinkage } } : {}),
  }
  return { ok: true }
}
