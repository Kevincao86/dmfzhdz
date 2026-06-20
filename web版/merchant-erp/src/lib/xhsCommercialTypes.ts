/** 小红书商业化：聚光（投流）+ 种小草（线索），共用授权 */

export type XhsCommercialBindState = {
  bindingId?: string
  appId: string
  accessToken: string
  advertiserId: string
  accountName: string
  boundAt: string
  demoMode?: boolean
}

export type XhsProjectRow = {
  projectId: string
  projectName: string
  status: string
  statusLabel: string
  budgetYuan?: number
  marketingGoal?: string
  createTime?: string
}

export type XhsPromotionRow = {
  promotionId: string
  promotionName: string
  projectId: string
  projectName?: string
  statusFirst: string
  statusLabel: string
  budgetYuan?: number
  bidYuan?: number
  statCost?: number
  showCnt?: number
  clickCnt?: number
  convertCnt?: number
  ctr?: number
  marketingGoal?: string
}

export type XhsClueRow = {
  clueId: string
  name: string
  phone: string
  city?: string
  clueSource?: string
  promotionName?: string
  convertState: string
  convertStateLabel: string
  createdAt: string
  callbackDone?: boolean
}

export type XhsReportSummary = {
  statCost: number
  showCnt: number
  clickCnt: number
  convertCnt: number
  ctr: number
  cpl?: number
  dateRange: { start: string; end: string }
}

export const XHS_CLUE_CONVERT_STATES = [
  { value: 'CLUE_CONFIRM', label: '有意向' },
  { value: 'CLUE_HIGH_INTENTION', label: '高意向' },
  { value: 'ARRIVAL', label: '到店' },
  { value: 'CONVERSION_CLASS', label: '已成交' },
  { value: 'INVALID_EVENT', label: '无效' },
] as const

export type XhsClueConvertState = (typeof XHS_CLUE_CONVERT_STATES)[number]['value']
