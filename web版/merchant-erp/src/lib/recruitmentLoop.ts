import type {
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
  RecruitmentFulfillmentLoop,
} from './opsRegistryTypes.js'

export type { RecruitmentFulfillmentLoop }

type LoopInferInput = {
  orderKind?: RegistryRecruitmentOrder['orderKind']
  hall?: RegistryMpRecruitmentOrder['hall']
  fulfillmentLoop?: RecruitmentFulfillmentLoop
}

export function inferFulfillmentLoop(order: LoopInferInput): RecruitmentFulfillmentLoop {
  if (order.fulfillmentLoop === 'open' || order.fulfillmentLoop === 'closed') {
    return order.fulfillmentLoop
  }
  if (order.orderKind === 'recruitment_ice' || order.hall === 'ice') return 'closed'
  return 'open'
}

export function fulfillmentLoopLabel(loop: RecruitmentFulfillmentLoop): string {
  return loop === 'closed' ? '闭环' : '开环'
}

export function mpHallDisplayLabel(mp: RegistryMpRecruitmentOrder): string {
  const loop = inferFulfillmentLoop(mp)
  if (loop === 'closed') return '云剪任务'
  if (mp.urgent) return '急单大厅'
  return '招募大厅'
}

export type RecruitmentProgressStep = {
  title: string
  note: string
  done: boolean
  current: boolean
}

const OPEN_PROGRESS: Omit<RecruitmentProgressStep, 'done' | 'current'>[] = [
  { title: '需求已提交', note: '运营接单并发布招募' },
  { title: '达人报名', note: '小程序报名，运营反选' },
  { title: '寄样 / 探店', note: '寄样物流与探店排期' },
  { title: '内容审核', note: '成片上传与发布审核' },
  { title: '数据与结算', note: '数据抓取与结款' },
]

const CLOSED_PROGRESS: Omit<RecruitmentProgressStep, 'done' | 'current'>[] = [
  { title: '云剪成片', note: '批量云剪完成并派发' },
  { title: '运营下发', note: '云剪单进入达人小程序' },
  { title: '确认接收', note: '达人确认后分配成片' },
  { title: '发布回链', note: '抖音发布与 AI 核查' },
  { title: '待结算', note: '达标后自动进入结算' },
]

function mapProgress(
  base: Omit<RecruitmentProgressStep, 'done' | 'current'>[],
  doneThrough: number,
  currentIdx: number,
): RecruitmentProgressStep[] {
  return base.map((x, i) => ({
    ...x,
    done: i < doneThrough,
    current: i === currentIdx,
  }))
}

export function buildRecruitmentProgressStepsForOrder(
  order: Pick<RegistryRecruitmentOrder, 'status' | 'orderKind' | 'fulfillmentLoop' | 'linkedMpOrderId'>,
): RecruitmentProgressStep[] {
  const loop = inferFulfillmentLoop(order)
  if (loop === 'closed') {
    const { status } = order
    if (status === 'cancelled' || status === 'refunded') {
      return mapProgress(CLOSED_PROGRESS, 0, 0)
    }
    if (status === 'pending') return mapProgress(CLOSED_PROGRESS, 1, 1)
    if (status === 'accepted' && !order.linkedMpOrderId) return mapProgress(CLOSED_PROGRESS, 1, 2)
    if (status === 'accepted') return mapProgress(CLOSED_PROGRESS, 2, 3)
    if (status === 'done') {
      return CLOSED_PROGRESS.map((x) => ({ ...x, done: true, current: false }))
    }
    return mapProgress(CLOSED_PROGRESS, 1, 2)
  }

  const { status } = order
  if (status === 'cancelled' || status === 'refunded') {
    return mapProgress(OPEN_PROGRESS, 0, 0)
  }
  if (status === 'pending') return mapProgress(OPEN_PROGRESS, 1, 1)
  if (status === 'accepted') return mapProgress(OPEN_PROGRESS, 2, 3)
  if (status === 'done') {
    return OPEN_PROGRESS.map((x) => ({ ...x, done: true, current: false }))
  }
  return mapProgress(OPEN_PROGRESS, 1, 1)
}

export function mpApplicantTaskStatusLabel(
  status: string | undefined,
  loop: RecruitmentFulfillmentLoop,
): string {
  if (!status || status === 'applied') return loop === 'closed' ? '待确认接收' : '已报名'
  const m: Record<string, string> = {
    pending_confirm: '待确认接收',
    confirmed: '已确认 · 待发布',
    rejected: '已拒绝',
    shortlisted: '初筛通过',
    approved: '已通过 · 待寄样',
  }
  return m[status] ?? status
}
