import {
  encodeDouyinNotificationJson,
  normalizeDouyinNotificationValue,
  notificationContentFromErp,
} from './douyinNotificationFormat.js'

export {
  encodeDouyinNotificationJson,
  isDouyinNotificationAttrJson,
  normalizeDouyinNotificationValue,
} from './douyinNotificationFormat.js'

/** ERP 投放渠道 → 来客 show_channel（INT 字符串写入 attr_key_value_map） */
export const ERP_SALES_CHANNEL_TO_SHOW_CHANNEL: Record<string, number> = {
  unlimited: 1,
  live_only: 2,
  offline_only: 5,
  newcomer_only: 7,
  online_only: 8,
  free_trial_only: 18,
  group_mall_only: 22,
  live_and_acquisition: 23,
  event_only: 25,
}

const DEFAULT_SHOW_CHANNELS = [1, 2, 5, 7, 8, 18, 22, 23, 25]
const RETAIL_SHOW_CHANNELS = [1, 2]

export function isDouyinRetailCategory(categoryId: string): boolean {
  return String(categoryId ?? '').trim() === '5003003'
}

/** goodlife product/save 顶层售卖时间等：平台要求 Unix 秒，勿传毫秒 */
export function toDouyinUnixSeconds(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return Math.floor(Date.now() / 1000)
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
}

export function normalizeGoodlifeProductTopLevelTimes(product: Record<string, unknown>): void {
  for (const key of ['sold_start_time', 'sold_end_time'] as const) {
    if (product[key] == null) continue
    product[key] = toDouyinUnixSeconds(product[key])
  }
}

/** 从 template.get 的 value_demo 解析允许的 show_channel 枚举，如 "1-不限制 2-仅直播间" */
export function allowedShowChannelsFromTemplateAttrs(
  productAttrs: Array<Record<string, unknown>>,
): number[] {
  for (const a of productAttrs) {
    if (String(a.key ?? '').trim().toLowerCase() !== 'show_channel') continue
    const demo = `${a.value_demo ?? ''} ${a.desc ?? ''} ${a.name ?? ''}`
    const nums = [...demo.matchAll(/(?:^|[\s,;，；])(\d+)\s*[-–—]/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 100)
    if (nums.length) return [...new Set(nums)]
  }
  return []
}

export function normalizeDouyinShowChannelValue(
  raw: string,
  erpChannelKey: string,
  categoryId: string,
  templateAllowed?: number[],
): string {
  let n = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n) && erpChannelKey) {
    n = ERP_SALES_CHANNEL_TO_SHOW_CHANNEL[erpChannelKey.trim()] ?? 1
  }
  if (!Number.isFinite(n)) n = 1

  let allowed =
    templateAllowed && templateAllowed.length > 0
      ? templateAllowed
      : isDouyinRetailCategory(categoryId)
        ? RETAIL_SHOW_CHANNELS
        : DEFAULT_SHOW_CHANNELS

  if (allowed.length === 1 && allowed[0] === 1) allowed = [1, 2]

  if (!allowed.includes(n)) n = allowed[0] ?? 1
  return String(n)
}

export function douyinUseDateJson(validDays: number, mode?: 'days' | 'calendar', start?: string, end?: string): string {
  const days = Math.max(1, Math.floor(validDays) || 360)
  if (mode === 'calendar') {
    const useStart = (start ?? '').trim() || new Date().toISOString().slice(0, 10)
    const useEnd =
      (end ?? '').trim() || new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
    return JSON.stringify({ use_date_type: 1, use_start_date: useStart, use_end_date: useEnd })
  }
  return JSON.stringify({ use_date_type: 2, day_duration: days })
}

export function douyinUseTimeJson(): string {
  return JSON.stringify({ use_time_type: 1 })
}

/** 文档 CanNoUseDateStruct：必填 enable */
export function douyinCanNoUseDateJson(enabled = false): string {
  return JSON.stringify({ enable: enabled })
}

export function douyinAppointmentJson(
  needAppointment: boolean,
  aheadDayNum = 1,
): string {
  if (!needAppointment) {
    return JSON.stringify({ need_appointment: false })
  }
  return JSON.stringify({
    need_appointment: true,
    ahead_time_type: 1,
    ahead_day_num: Math.max(1, Math.floor(aheadDayNum) || 1),
  })
}

/**
 * 限制使用规则 LimitUseRuleStruct（与 sku.limit_rule 的 is_limit 不同）。
 * @see template.get limit_use_rule — is_limit_use + use_num_per_consume
 */
export function douyinLimitUseRuleJson(limitUse = false, useNumPerConsume = 1): string {
  if (!limitUse) {
    return JSON.stringify({ is_limit_use: false })
  }
  return JSON.stringify({
    is_limit_use: true,
    use_num_per_consume: Math.max(1, Math.floor(useNumPerConsume) || 1),
  })
}

export function normalizeDouyinLimitUseRuleValue(raw: string): string {
  const cur = tryParseJsonObject(raw)
  if (!cur) return douyinLimitUseRuleJson(false)
  if (typeof cur.is_limit_use === 'boolean') {
    if (!cur.is_limit_use) return douyinLimitUseRuleJson(false)
    const n = Number(cur.use_num_per_consume)
    return douyinLimitUseRuleJson(true, Number.isFinite(n) && n > 0 ? n : 1)
  }
  if (typeof cur.is_limit === 'boolean') {
    return douyinLimitUseRuleJson(false)
  }
  return douyinLimitUseRuleJson(false)
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const s = raw.trim()
  if (!s.startsWith('{')) return null
  try {
    const j = JSON.parse(s) as unknown
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function attrKeyEq(key: string, target: string): boolean {
  return key.trim().toLowerCase() === target.toLowerCase()
}

/**
 * 保存前统一规范 show_channel / use_date / use_time / can_no_use_date / appointment。
 */
export function sanitizeDouyinTradeRuleProductAttrs(
  merged: Record<string, string>,
  erp: Record<string, unknown>,
  categoryId: string,
  templateProductAttrs: Array<Record<string, unknown>> = [],
): void {
  const productName = String(erp.product_name ?? '').trim()
  const productDesc = String(erp.product_desc ?? '').trim()
  const notificationBody = notificationContentFromErp(erp, productDesc, productName)
  const sales =
    erp.sales_info && typeof erp.sales_info === 'object' ? (erp.sales_info as Record<string, unknown>) : {}
  const trade =
    erp.trade_rules && typeof erp.trade_rules === 'object' ? (erp.trade_rules as Record<string, unknown>) : {}
  const chKey = typeof sales.channel === 'string' ? sales.channel.trim() : ''
  const validDays = Math.max(1, Math.floor(Number(trade.consume_valid_days) || 360))
  const consumeMode =
    trade.consume_date_mode === 'calendar' ? 'calendar' : ('days' as 'days' | 'calendar')
  const reserveMode = typeof trade.reserve_mode === 'string' ? trade.reserve_mode.trim() : ''
  const reserveAdvance = Math.max(1, Math.floor(Number(trade.reserve_advance_value) || 1))
  const allowedShow = allowedShowChannelsFromTemplateAttrs(templateProductAttrs)
  const consume =
    erp.consume_rules && typeof erp.consume_rules === 'object'
      ? (erp.consume_rules as Record<string, unknown>)
      : {}
  const voucherLimit = consume.voucher_limit === true
  const voucherMax = Math.max(1, Math.floor(Number(consume.voucher_max) || 1))

  for (const key of Object.keys(merged)) {
    const lk = key.toLowerCase()
    if (attrKeyEq(key, 'show_channel')) {
      merged[key] = normalizeDouyinShowChannelValue(merged[key] ?? '', chKey, categoryId, allowedShow)
      continue
    }
    if (attrKeyEq(key, 'use_date')) {
      const cur = tryParseJsonObject(merged[key] ?? '')
      if (!cur || cur.use_date_type == null) {
        merged[key] = douyinUseDateJson(validDays, consumeMode)
      }
      continue
    }
    if (attrKeyEq(key, 'use_time')) {
      const cur = tryParseJsonObject(merged[key] ?? '')
      if (!cur || cur.use_time_type == null) {
        merged[key] = douyinUseTimeJson()
      } else {
        const t = Number(cur.use_time_type)
        merged[key] = JSON.stringify({
          use_time_type: t === 2 ? 2 : 1,
          ...(t === 2 && Array.isArray(cur.time_period_list)
            ? { time_period_list: cur.time_period_list }
            : {}),
        })
      }
      continue
    }
    if (attrKeyEq(key, 'can_no_use_date')) {
      if (trade.non_consume_date_mode === 'partial_dates') {
        const block: Record<string, unknown> = { enable: true }
        if (Array.isArray(trade.non_consume_holidays) && trade.non_consume_holidays.length) {
          block.can_no_use_holiday = true
        }
        merged[key] = JSON.stringify(block)
        continue
      }
      const cur = tryParseJsonObject(merged[key] ?? '')
      if (!cur || typeof cur.enable !== 'boolean') {
        merged[key] = douyinCanNoUseDateJson(false)
      }
      continue
    }
    if (attrKeyEq(key, 'appointment')) {
      const cur = tryParseJsonObject(merged[key] ?? '')
      const need =
        cur?.need_appointment === true || reserveMode === 'required'
      if (!cur || cur.need_appointment == null) {
        merged[key] = douyinAppointmentJson(need, reserveAdvance)
      } else if (cur.need_appointment === true && cur.ahead_time_type == null) {
        merged[key] = douyinAppointmentJson(true, reserveAdvance)
      } else if (cur.need_appointment === false) {
        merged[key] = douyinAppointmentJson(false)
      }
      continue
    }
    if (attrKeyEq(key, 'limit_use_rule')) {
      merged[key] = voucherLimit
        ? douyinLimitUseRuleJson(true, voucherMax)
        : normalizeDouyinLimitUseRuleValue(merged[key] ?? '')
      continue
    }
    if (attrKeyEq(key, 'Notification')) {
      merged[key] = normalizeDouyinNotificationValue(
        merged[key] ?? '',
        '使用规则',
        notificationBody,
      )
      continue
    }
    if (lk === 'refundpolicy' || key === 'RefundPolicy') {
      const v = Number.parseInt(String(merged[key] ?? '').trim(), 10)
      if (!Number.isFinite(v) || v < 1 || v > 3) {
        const asp = typeof trade.after_sale_policy === 'string' ? trade.after_sale_policy.trim() : ''
        const rp = asp === 'no_refund' ? 2 : asp === 'refund_auto_expire' ? 3 : 1
        merged[key] = String(rp)
      }
    }
  }

  if (!Object.keys(merged).some((k) => attrKeyEq(k, 'show_channel'))) {
    merged.show_channel = normalizeDouyinShowChannelValue('', chKey, categoryId, allowedShow)
  }
  if (!Object.keys(merged).some((k) => attrKeyEq(k, 'use_date'))) {
    merged.use_date = douyinUseDateJson(validDays, consumeMode)
  }
  if (!Object.keys(merged).some((k) => attrKeyEq(k, 'use_time'))) {
    merged.use_time = douyinUseTimeJson()
  }
  if (!Object.keys(merged).some((k) => attrKeyEq(k, 'can_no_use_date'))) {
    merged.can_no_use_date = douyinCanNoUseDateJson(false)
  }
  if (!Object.keys(merged).some((k) => attrKeyEq(k, 'appointment'))) {
    merged.appointment = douyinAppointmentJson(reserveMode === 'required', reserveAdvance)
  }
  const tplNeedsLimitUseRule = templateProductAttrs.some((a) =>
    attrKeyEq(String(a.key ?? ''), 'limit_use_rule'),
  )
  if (tplNeedsLimitUseRule && !Object.keys(merged).some((k) => attrKeyEq(k, 'limit_use_rule'))) {
    merged.limit_use_rule = voucherLimit ? douyinLimitUseRuleJson(true, voucherMax) : douyinLimitUseRuleJson(false)
  }
  if (trade.non_consume_date_mode === 'partial_dates' && !Object.keys(merged).some((k) => attrKeyEq(k, 'can_no_use_date'))) {
    const block: Record<string, unknown> = { enable: true }
    if (Array.isArray(trade.non_consume_holidays) && trade.non_consume_holidays.length) {
      block.can_no_use_holiday = true
    }
    merged.can_no_use_date = JSON.stringify(block)
  }
  const tplNeedsNotification = templateProductAttrs.some((a) =>
    attrKeyEq(String(a.key ?? ''), 'Notification'),
  )
  if (tplNeedsNotification && !Object.keys(merged).some((k) => attrKeyEq(k, 'Notification'))) {
    merged.Notification = encodeDouyinNotificationJson('使用规则', notificationBody)
  }
}

/** 将 ERP 扩展售卖/交易规则写入 product 顶层时间与 attr / sku */
export function applyErpExtendedRulesToGoodlifeSave(
  product: Record<string, unknown>,
  mergedProductAttrs: Record<string, string>,
  skuAttrMap: Record<string, string>,
  erp: Record<string, unknown>,
): void {
  const sales =
    erp.sales_info && typeof erp.sales_info === 'object' ? (erp.sales_info as Record<string, unknown>) : {}
  const trade =
    erp.trade_rules && typeof erp.trade_rules === 'object' ? (erp.trade_rules as Record<string, unknown>) : {}
  const consume =
    erp.consume_rules && typeof erp.consume_rules === 'object'
      ? (erp.consume_rules as Record<string, unknown>)
      : {}

  if (sales.sale_time_limited === true) {
    const st = sales.sale_start
    const en = sales.sale_end
    if (st != null && String(st).trim()) {
      product.sold_start_time = toDouyinUnixSeconds(st)
    }
    if (en != null && String(en).trim()) {
      product.sold_end_time = toDouyinUnixSeconds(en)
    }
  }

  if (trade.daily_consume_mode === 'time_slots' && Array.isArray(trade.daily_time_periods)) {
    const periods = (trade.daily_time_periods as { start?: string; end?: string }[]).filter(
      (p) => p && String(p.start ?? '').trim() && String(p.end ?? '').trim(),
    )
    if (periods.length > 0) {
      for (const key of Object.keys(mergedProductAttrs)) {
        if (attrKeyEq(key, 'use_time')) {
          mergedProductAttrs[key] = JSON.stringify({
            use_time_type: 2,
            time_period_list: periods.map((p) => ({
              start_time: String(p.start).trim(),
              end_time: String(p.end).trim(),
            })),
          })
        }
      }
      if (!Object.keys(mergedProductAttrs).some((k) => attrKeyEq(k, 'use_time'))) {
        mergedProductAttrs.use_time = JSON.stringify({
          use_time_type: 2,
          time_period_list: periods.map((p) => ({
            start_time: String(p.start).trim(),
            end_time: String(p.end).trim(),
          })),
        })
      }
    }
  }

  if (trade.non_consume_date_mode === 'partial_dates') {
    const block: Record<string, unknown> = { enable: true }
    if (Array.isArray(trade.non_consume_holidays) && trade.non_consume_holidays.length) {
      block.can_no_use_holiday = true
    }
    for (const key of Object.keys(mergedProductAttrs)) {
      if (attrKeyEq(key, 'can_no_use_date')) {
        mergedProductAttrs[key] = JSON.stringify(block)
      }
    }
    if (!Object.keys(mergedProductAttrs).some((k) => attrKeyEq(k, 'can_no_use_date'))) {
      mergedProductAttrs.can_no_use_date = JSON.stringify(block)
    }
  }

  if (consume.voucher_limit === true) {
    const max = Math.max(1, Math.floor(Number(consume.voucher_max) || 1))
    for (const key of Object.keys(mergedProductAttrs)) {
      if (attrKeyEq(key, 'limit_use_rule')) {
        mergedProductAttrs[key] = douyinLimitUseRuleJson(true, max)
      }
    }
    if (!Object.keys(mergedProductAttrs).some((k) => attrKeyEq(k, 'limit_use_rule'))) {
      mergedProductAttrs.limit_use_rule = douyinLimitUseRuleJson(true, max)
    }
  }

  if (trade.customer_purchase_limit_mode === 'limited') {
    const perPerson = Math.max(0, Math.floor(Number(trade.customer_purchase_limit_max) || 0))
    const perDay = Math.max(0, Math.floor(Number(trade.customer_purchase_limit_per_day) || 0))
    const limitNum = perPerson || perDay || 1
    skuAttrMap.limit_rule = JSON.stringify({ is_limit: true, limit_num: limitNum })
  }
}
