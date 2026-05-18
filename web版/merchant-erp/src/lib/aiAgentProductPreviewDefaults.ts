import type { DouyinProductFormRules } from './douyinProductRuleText'

/** AI 助手商品预览用的默认交易/售后规则（与创建向导初始值一致） */
export function defaultAiAgentPreviewFormRules(): DouyinProductFormRules {
  return {
    salesChannel: 'unlimited',
    saleTimeLimited: false,
    consumeValidDays: 360,
    nonConsumeDateMode: 'all_dates',
    nonConsumeWeekdays: [],
    nonConsumeHolidays: [],
    nonConsumeSpecificDates: [],
    dailyAllDay: true,
    dailyTimePeriods: [{ start: '09:00', end: '22:00' }],
    purchaseLimitMode: 'none',
    reserveMode: 'none',
    reserveAdvanceDays: 1,
    voucherUseLimit: true,
    voucherUseMax: 1,
    afterSalePolicy: 'refund_anytime',
  }
}

/** 从用户描述推断来客 product_type：1 团购 / 2 代金券 */
export function inferDouyinProductTypeFromText(text: string): number {
  const t = text.trim()
  if (/代金券|代\d+抵|抵\d+|满\d+.*抵|券面/.test(t)) return 2
  return 1
}
