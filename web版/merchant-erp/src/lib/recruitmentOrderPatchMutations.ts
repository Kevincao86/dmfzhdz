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
}

export function patchRecruitmentOrderInSnapshot(
  data: RegistrySnapshot,
  body: RecruitmentOrderPatchBody,
): { ok: true } | { ok: false; error: string; status: number } {
  const id = (body.id ?? '').trim()
  if (!id) return { ok: false, error: 'invalid_patch', status: 400 }

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
