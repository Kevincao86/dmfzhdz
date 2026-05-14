import type { RegistryRecruitmentOrder } from './opsRegistryTypes'

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

export type RecruitmentProgressStep = {
  title: string
  note: string
  done: boolean
  current: boolean
}

/**
 * 与招募主流程对齐的 5 个环节（发布之后视角）。
 */
export function buildRecruitmentProgressSteps(
  status: RegistryRecruitmentOrder['status'],
): RecruitmentProgressStep[] {
  const base: Omit<RecruitmentProgressStep, 'done' | 'current'>[] = [
    { title: '需求已提交', note: '已推送运营台，待接单' },
    { title: '达人池筛选', note: '匹配 / 邀约达人' },
    { title: '排期编排', note: '档期与门店协调' },
    { title: '视频审核', note: '成片审核与发布' },
    { title: '结款账单', note: '结算与归档' },
  ]
  if (status === 'cancelled' || status === 'refunded') {
    return base.map((x, i) => ({
      ...x,
      done: false,
      current: i === 0,
    }))
  }
  if (status === 'pending') {
    return base.map((x, i) => ({
      ...x,
      done: i === 0,
      current: i === 1,
    }))
  }
  if (status === 'accepted') {
    return base.map((x, i) => ({
      ...x,
      done: i < 2,
      current: i === 2,
    }))
  }
  if (status === 'done') {
    return base.map((x) => ({ ...x, done: true, current: false }))
  }
  return base.map((x, i) => ({
    ...x,
    done: i === 0,
    current: i === 1,
  }))
}
