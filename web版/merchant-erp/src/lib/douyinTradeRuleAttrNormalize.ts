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
      const cur = tryParseJsonObject(merged[key] ?? '')
      if (!cur || typeof cur.enable !== 'boolean') {
        const legacyEnable = cur?.can_no_use_holiday === true
        merged[key] = douyinCanNoUseDateJson(Boolean(legacyEnable))
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
      merged[key] = normalizeDouyinLimitUseRuleValue(merged[key] ?? '')
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
    merged.limit_use_rule = douyinLimitUseRuleJson(false)
  }
}
