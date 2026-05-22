import type {
  RegistryIceVideoSlot,
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
} from './opsRegistryTypes'

export const ICE_DISPATCH_TRACK_KEY = 'meoo_ice_dispatch_track_v1'

export type IceDispatchTrackV1 = {
  v: 1
  merchantOrderId: string
  dispatchedAt: string
}

export function readIceDispatchTrack(): IceDispatchTrackV1 | null {
  try {
    const raw = window.localStorage.getItem(ICE_DISPATCH_TRACK_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<IceDispatchTrackV1>
    if (o.v !== 1 || !o.merchantOrderId?.trim()) return null
    return {
      v: 1,
      merchantOrderId: o.merchantOrderId.trim(),
      dispatchedAt: typeof o.dispatchedAt === 'string' ? o.dispatchedAt : '',
    }
  } catch {
    return null
  }
}

export function writeIceDispatchTrack(merchantOrderId: string): void {
  const payload: IceDispatchTrackV1 = {
    v: 1,
    merchantOrderId,
    dispatchedAt: new Date().toISOString(),
  }
  window.localStorage.setItem(ICE_DISPATCH_TRACK_KEY, JSON.stringify(payload))
}

export type IceSlotProgressStage =
  | 'ops_pending'
  | 'waiting_talent'
  | 'pending_confirm'
  | 'in_progress'
  | 'verify_pending'
  | 'done'
  | 'verify_failed'

export type IceVideoSlotProgressRow = {
  slotId: string
  label: string
  iceJobId?: string
  stage: IceSlotProgressStage
  stageLabel: string
  talentName?: string
  talentPlatform?: string
  detail?: string
}

function findApplicantForSlot(
  mp: RegistryMpRecruitmentOrder | null | undefined,
  slot: RegistryIceVideoSlot,
) {
  if (!mp) return undefined
  const aid = slot.assignedApplicantId?.trim()
  if (!aid) return undefined
  return (mp.applicants ?? []).find((a) => a.id === aid)
}

function resolveSlotStage(
  merchantOrder: RegistryRecruitmentOrder | null | undefined,
  mp: RegistryMpRecruitmentOrder | null | undefined,
  slot: RegistryIceVideoSlot,
): IceVideoSlotProgressRow {
  const base = {
    slotId: slot.slotId,
    label: slot.label || slot.slotId,
    iceJobId: slot.iceJobId,
  }
  const app = findApplicantForSlot(mp, slot)
  const talentName = app?.name?.trim() || app?.platformNickname?.trim()
  const talentPlatform = app?.platform?.trim()

  if (!merchantOrder?.linkedMpOrderId?.trim()) {
    if (merchantOrder?.status === 'accepted' || merchantOrder?.acceptMode === 'ice') {
      return {
        ...base,
        stage: 'ops_pending',
        stageLabel: '待运营下发云剪单',
        detail: '订单已提交运营台，等待创建小程序云剪任务',
      }
    }
    return {
      ...base,
      stage: 'ops_pending',
      stageLabel: '待运营处理',
      detail: '请在运营台「商家达人招募订单」选择云剪单并下发',
    }
  }

  if (!mp) {
    return {
      ...base,
      stage: 'waiting_talent',
      stageLabel: '待同步小程序单',
      detail: `关联单 ${merchantOrder.linkedMpOrderId}`,
    }
  }

  if (!slot.assignedApplicantId?.trim()) {
    return {
      ...base,
      stage: 'waiting_talent',
      stageLabel: '待达人接单',
      detail: mp.status === 'closed' ? '任务已关闭' : '达人可在小程序云剪任务大厅认领',
    }
  }

  if (!app) {
    return {
      ...base,
      stage: 'waiting_talent',
      stageLabel: '已占位',
      detail: '达人信息同步中',
    }
  }

  if (app.taskStatus === 'rejected') {
    return {
      ...base,
      stage: 'waiting_talent',
      stageLabel: '待重新接单',
      talentName,
      talentPlatform,
      detail: '上一任达人已拒绝，名额已释放',
    }
  }

  if (app.taskStatus === 'pending_confirm' || (!app.taskStatus && !app.assignedIceSlotId)) {
    return {
      ...base,
      stage: 'pending_confirm',
      stageLabel: '已认领 · 待确认',
      talentName,
      talentPlatform,
      detail: talentName ? `${talentName} 待确认接收任务` : '待达人确认接收',
    }
  }

  if (app.aiVerifyStatus === 'passed' || app.completedAt) {
    return {
      ...base,
      stage: 'done',
      stageLabel: '已完成',
      talentName,
      talentPlatform,
      detail: app.douyinPublishUrl ? '抖音回链已提交并通过核查' : '任务已完成',
    }
  }

  if (app.aiVerifyStatus === 'failed') {
    return {
      ...base,
      stage: 'verify_failed',
      stageLabel: '核查未通过',
      talentName,
      talentPlatform,
      detail: app.aiVerifyNote || '请达人重新提交抖音作品链接',
    }
  }

  if (app.douyinPublishUrl?.trim()) {
    return {
      ...base,
      stage: 'verify_pending',
      stageLabel: '待核查',
      talentName,
      talentPlatform,
      detail: '已回传抖音链接，等待 AI 核查',
    }
  }

  if (app.taskStatus === 'confirmed' || app.assignedIceSlotId) {
    return {
      ...base,
      stage: 'in_progress',
      stageLabel: '已接单 · 进行中',
      talentName,
      talentPlatform,
      detail: '达人已确认接收，待下载成片并发布抖音',
    }
  }

  return {
    ...base,
    stage: 'waiting_talent',
    stageLabel: '待达人接单',
    talentName,
    talentPlatform,
  }
}

export function buildIceVideoSlotProgress(
  merchantOrder: RegistryRecruitmentOrder | null | undefined,
  mpOrder: RegistryMpRecruitmentOrder | null | undefined,
): IceVideoSlotProgressRow[] {
  const slots =
    merchantOrder?.iceVideoSlots?.length
      ? merchantOrder.iceVideoSlots
      : mpOrder?.iceVideoSlots ?? []
  return slots.map((slot) => resolveSlotStage(merchantOrder, mpOrder, slot))
}

export function summarizeIceSlotProgress(rows: IceVideoSlotProgressRow[]): {
  total: number
  waiting: number
  accepted: number
  done: number
} {
  const total = rows.length
  const done = rows.filter((r) => r.stage === 'done').length
  const accepted = rows.filter(
    (r) =>
      r.stage === 'pending_confirm' ||
      r.stage === 'in_progress' ||
      r.stage === 'verify_pending' ||
      r.stage === 'verify_failed',
  ).length
  const waiting = rows.filter((r) => r.stage === 'ops_pending' || r.stage === 'waiting_talent').length
  return { total, waiting, accepted, done }
}

export function findMpOrderForMerchantIce(
  reg: {
    mpRecruitmentOrders?: RegistryMpRecruitmentOrder[]
  },
  merchantOrder: RegistryRecruitmentOrder | null | undefined,
): RegistryMpRecruitmentOrder | null {
  if (!merchantOrder) return null
  const list = reg.mpRecruitmentOrders ?? []
  const linked = merchantOrder.linkedMpOrderId?.trim()
  if (linked) {
    const hit = list.find((o) => o.id === linked)
    if (hit) return hit
  }
  return (
    list.find(
      (o) =>
        o.sourceMerchantOrderId === merchantOrder.id &&
        (o.orderKind === 'recruitment_ice' || o.hall === 'ice'),
    ) ?? null
  )
}
