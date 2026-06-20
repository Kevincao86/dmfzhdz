/** 巨量引擎本地推 Open API 前端类型（对齐 open.oceanengine.com 本地推标签） */

export type LocalPromotionBindState = {
  /** Supabase tenant_merchant_bindings.id */
  bindingId?: string
  appId: string
  appSecret?: string
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: string
  localAccountId: string
  accountName: string
  boundAt: string
  /** 演示模式：未配置真实 token 时使用本地样例数据 */
  demoMode?: boolean
}

export type LocalProjectRow = {
  projectId: string
  projectName: string
  status: string
  statusLabel: string
  budgetYuan?: number
  marketingGoal?: string
  createTime?: string
}

export type LocalPromotionRow = {
  promotionId: string
  promotionName: string
  projectId: string
  projectName?: string
  statusFirst: string
  statusLabel: string
  budgetYuan?: number
  bidYuan?: number
  marketingGoal?: string
  learningPhase?: string
  createTime?: string
  /** 报表指标（合并 report 接口） */
  statCost?: number
  showCnt?: number
  clickCnt?: number
  convertCnt?: number
  ctr?: number
}

export type LocalClueRow = {
  clueId: string
  name: string
  phone: string
  city?: string
  clueSource?: string
  promotionName?: string
  convertState: string
  convertStateLabel: string
  createdAt: string
  remark?: string
  /** 是否已回传跟进状态 */
  callbackDone?: boolean
}

export type LocalReportSummary = {
  statCost: number
  showCnt: number
  clickCnt: number
  convertCnt: number
  ctr: number
  cpl?: number
  dateRange: { start: string; end: string }
}

export const CLUE_CONVERT_STATES = [
  { value: 'CLUE_CONFIRM', label: '有意向' },
  { value: 'CLUE_HIGH_INTENTION', label: '高意向/定金' },
  { value: 'ARRIVAL', label: '到店/上门' },
  { value: 'CONVERSION_CLASS', label: '正价成交' },
  { value: 'INVALID_EVENT', label: '无效线索' },
] as const

export type ClueConvertState = (typeof CLUE_CONVERT_STATES)[number]['value']
