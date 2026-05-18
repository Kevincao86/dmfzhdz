import { sanitizeDouyinProductDescriptionCompliance } from './douyinDescCompliance.js'

/**
 * 将售卖/消费/预约等规则整理为「商品说明」附录，供 description_rich_text / Notification 展示。
 * 网关仍按 trade_rules / sales_info 写入 use_date、use_time、limit_use_rule 等 OpenAPI 字段。
 */

export type DouyinWeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const DOUYIN_WEEKDAY_LABELS: Record<DouyinWeekdayKey, string> = {
  mon: '周一',
  tue: '周二',
  wed: '周三',
  thu: '周四',
  fri: '周五',
  sat: '周六',
  sun: '周日',
}

/** 与来客后台常见节假日对齐（可按年维护） */
export const DOUYIN_COMMON_HOLIDAYS: { id: string; label: string }[] = [
  { id: 'new_year', label: '元旦' },
  { id: 'spring_festival', label: '春节' },
  { id: 'qingming', label: '清明节' },
  { id: 'labor_day', label: '劳动节' },
  { id: 'dragon_boat', label: '端午节' },
  { id: 'mid_autumn', label: '中秋节' },
  { id: 'national_day', label: '国庆节' },
]

export type DouyinTimePeriod = { start: string; end: string }

export type DouyinProductFormRules = {
  salesChannel: string
  saleTimeLimited: boolean
  saleStart?: string
  saleEnd?: string
  consumeValidDays: number
  nonConsumeDateMode: 'all_dates' | 'partial_dates'
  nonConsumeWeekdays: DouyinWeekdayKey[]
  nonConsumeHolidays: string[]
  nonConsumeSpecificDates: string[]
  dailyAllDay: boolean
  dailyTimePeriods: DouyinTimePeriod[]
  purchaseLimitMode: 'none' | 'limited'
  purchaseLimitPerPerson?: number
  purchaseLimitPerDay?: number
  reserveMode: 'none' | 'required'
  reserveAdvanceDays?: number
  voucherUseLimit: boolean
  voucherUseMax?: number
  afterSalePolicy: string
}

const CHANNEL_LABELS: Record<string, string> = {
  unlimited: '不限制渠道',
  live_only: '仅直播间',
  offline_only: '仅线下',
  newcomer_only: '仅新人频道',
  online_only: '仅线上',
  free_trial_only: '仅免费试',
  group_mall_only: '仅团购商城',
  live_and_acquisition: '直播间+获客卡',
  event_only: '仅活动报名',
}

const AFTER_SALE_LABELS: Record<string, string> = {
  refund_anytime: '随时退',
  refund_auto_expire: '过期自动退',
  no_refund: '不可退',
}

function fmtLocalDateTime(isoLocal: string | undefined): string {
  const s = String(isoLocal ?? '').trim()
  if (!s) return ''
  return s.replace('T', ' ').slice(0, 16)
}

export function buildTradeRuleDescriptionLines(rules: DouyinProductFormRules): string[] {
  const lines: string[] = []

  const ch = CHANNEL_LABELS[rules.salesChannel] ?? rules.salesChannel
  if (ch) lines.push(`投放渠道：${ch}`)

  if (rules.saleTimeLimited) {
    const a = fmtLocalDateTime(rules.saleStart)
    const b = fmtLocalDateTime(rules.saleEnd)
    lines.push(a && b ? `售卖时间：${a} 至 ${b}` : '售卖时间：限时售卖（请补充起止时间）')
  } else {
    lines.push('售卖时间：不限时间')
  }

  lines.push(`顾客可消费：购买后 ${Math.max(1, rules.consumeValidDays)} 天内可用`)

  if (rules.nonConsumeDateMode === 'all_dates') {
    lines.push('不可消费日期：所有日期均可使用')
  } else {
    const parts: string[] = []
    if (rules.nonConsumeWeekdays.length) {
      parts.push(
        `每周${rules.nonConsumeWeekdays.map((k) => DOUYIN_WEEKDAY_LABELS[k]).join('、')}不可用`,
      )
    }
    if (rules.nonConsumeHolidays.length) {
      const hol = rules.nonConsumeHolidays
        .map((id) => DOUYIN_COMMON_HOLIDAYS.find((h) => h.id === id)?.label ?? id)
        .join('、')
      if (hol) parts.push(`节假日不可用：${hol}`)
    }
    if (rules.nonConsumeSpecificDates.length) {
      parts.push(`指定日期不可用：${rules.nonConsumeSpecificDates.join('、')}`)
    }
    lines.push(
      parts.length ? `不可消费日期：${parts.join('；')}` : '不可消费日期：部分日期不可用（请补充规则）',
    )
  }

  if (rules.dailyAllDay) {
    lines.push('每日使用时段：全天可用')
  } else if (rules.dailyTimePeriods.length) {
    const slots = rules.dailyTimePeriods
      .filter((p) => p.start && p.end)
      .map((p) => `${p.start}-${p.end}`)
      .join('、')
    lines.push(slots ? `每日使用时段：${slots}` : '每日使用时段：仅指定时间可用（请补充时段）')
  } else {
    lines.push('每日使用时段：仅指定时间可用（请补充时段）')
  }

  if (rules.purchaseLimitMode === 'none') {
    lines.push('限购：不限制购买')
  } else {
    const bits: string[] = []
    if (rules.purchaseLimitPerPerson && rules.purchaseLimitPerPerson > 0) {
      bits.push(`每人最多购买 ${rules.purchaseLimitPerPerson} 份`)
    }
    if (rules.purchaseLimitPerDay && rules.purchaseLimitPerDay > 0) {
      bits.push(`每人每天最多购买 ${rules.purchaseLimitPerDay} 份`)
    }
    lines.push(bits.length ? `限购：${bits.join('；')}` : '限购：限制购买（请补充数量）')
  }

  lines.push(
    rules.reserveMode === 'required'
      ? `预约：需提前 ${Math.max(1, rules.reserveAdvanceDays ?? 1)} 天电话预约`
      : '预约：到店不需要预约',
  )

  if (rules.voucherUseLimit && rules.voucherUseMax && rules.voucherUseMax > 0) {
    lines.push(`使用张数：每次消费最多使用 ${rules.voucherUseMax} 张`)
  } else {
    lines.push('使用张数：不限制张数')
  }

  const asp = AFTER_SALE_LABELS[rules.afterSalePolicy] ?? rules.afterSalePolicy
  if (asp) lines.push(`售后政策：${asp}`)

  return lines
}

/** 合并用户手写说明与规则摘要（避免重复追加） */
export function composeProductDescWithRules(
  userDesc: string,
  rules: DouyinProductFormRules,
): string {
  const base = sanitizeDouyinProductDescriptionCompliance(String(userDesc ?? '').trim())
  const ruleLines = buildTradeRuleDescriptionLines(rules)
  const block = ruleLines.join('\n')
  if (!block) return base
  if (base.includes('投放渠道：') || base.includes('售卖时间：')) {
    return base
  }
  return base ? `${base}\n\n${block}` : block
}

export function parseFormRulesFromDetailPayload(
  trade: Record<string, unknown> | undefined,
  sales: Record<string, unknown> | undefined,
  consume: Record<string, unknown> | undefined,
): Partial<DouyinProductFormRules> {
  const t = trade ?? {}
  const s = sales ?? {}
  const c = consume ?? {}
  return {
    salesChannel: String(s.channel ?? 'unlimited'),
    saleTimeLimited: Boolean(s.sale_time_limited ?? false),
    saleStart: typeof s.sale_start === 'string' ? s.sale_start : undefined,
    saleEnd: typeof s.sale_end === 'string' ? s.sale_end : undefined,
    consumeValidDays: Number(t.consume_valid_days) || 360,
    nonConsumeDateMode:
      t.non_consume_date_mode === 'partial_dates' ? 'partial_dates' : 'all_dates',
    nonConsumeWeekdays: Array.isArray(t.non_consume_weekdays)
      ? (t.non_consume_weekdays as DouyinWeekdayKey[])
      : [],
    nonConsumeHolidays: Array.isArray(t.non_consume_holidays)
      ? (t.non_consume_holidays as string[])
      : [],
    nonConsumeSpecificDates: Array.isArray(t.non_consume_specific_dates)
      ? (t.non_consume_specific_dates as string[])
      : [],
    dailyAllDay: t.daily_consume_mode !== 'time_slots',
    dailyTimePeriods: Array.isArray(t.daily_time_periods)
      ? (t.daily_time_periods as DouyinTimePeriod[])
      : [{ start: '09:00', end: '22:00' }],
    purchaseLimitMode: t.customer_purchase_limit_mode === 'limited' ? 'limited' : 'none',
    purchaseLimitPerPerson: Number(t.customer_purchase_limit_max) || undefined,
    purchaseLimitPerDay: Number(t.customer_purchase_limit_per_day) || undefined,
    reserveMode: t.reserve_mode === 'required' ? 'required' : 'none',
    reserveAdvanceDays: Number(t.reserve_advance_value) || 1,
    voucherUseLimit: c.voucher_limit === true,
    voucherUseMax: Number(c.voucher_max) || 1,
    afterSalePolicy: String(t.after_sale_policy ?? 'refund_anytime'),
  }
}
