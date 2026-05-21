import type { RegistryRecruitmentOrder } from './opsRegistryTypes'
import {
  buildRecruitmentProgressStepsForOrder,
  type RecruitmentProgressStep,
} from './recruitmentLoop'

export function recruitmentOrderStatusLabel(s: RegistryRecruitmentOrder['status']): string {
  const m: Record<RegistryRecruitmentOrder['status'], string> = {
    pending: '待接单',
    accepted: '进行中',
    done: '已完成',
    cancelled: '已取消',
    refunded: '已退款',
  }
  return m[s] ?? s
}

export type { RecruitmentProgressStep }

export function buildRecruitmentProgressSteps(
  order: Pick<
    RegistryRecruitmentOrder,
    'status' | 'orderKind' | 'fulfillmentLoop' | 'linkedMpOrderId'
  >,
): RecruitmentProgressStep[] {
  return buildRecruitmentProgressStepsForOrder(order)
}
