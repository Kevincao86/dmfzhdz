/**
 * 来客 attr `SubTitle`（官方 template.get 说明）：
 * 过期退、随时退、x日内可退、免预约、提前x日预约；
 * 多个以英文半角 | 分隔，不要空格（目前仅退款/预约相关生效）。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/template.get
 */

export type DouyinSubTitleTradeContext = {
  afterSalePolicy?: string
  reserveMode?: string
  reserveAdvanceDays?: number
  consumeValidDays?: number
}

export function attrKeyIsDouyinSubTitle(key: string): boolean {
  return /^subtitle$/i.test(String(key ?? '').trim())
}

export function attrKeyIsDouyinProductNameHint(key: string): boolean {
  return /^product_name_hint$/i.test(String(key ?? '').trim())
}

const OFFICIAL_TAG_RE =
  /^(过期退|随时退|免预约|\d{1,3}日内可退|提前\d{1,2}日预约)$/

/** 从 ERP trade_rules 生成符合文档的 SubTitle */
export function buildDouyinSubTitleFromTradeRules(ctx: DouyinSubTitleTradeContext): string {
  const tags: string[] = []
  const asp = String(ctx.afterSalePolicy ?? 'refund_anytime').trim()

  if (asp === 'refund_auto_expire') {
    tags.push('过期退')
  } else if (asp === 'no_refund') {
    /** 不可退类目仍建议带「随时退」以外标签；平台侧 SubTitle 仅退款文案生效，默认给随时退避免空值 */
    tags.push('随时退')
  } else {
    tags.push('随时退')
  }

  const reserve = String(ctx.reserveMode ?? 'none').trim()
  if (reserve === 'required') {
    const d = Math.max(1, Math.min(30, Math.floor(Number(ctx.reserveAdvanceDays) || 1)))
    tags.push(`提前${d}日预约`)
  } else {
    tags.push('免预约')
  }

  const uniq: string[] = []
  for (const t of tags) {
    if (t && !uniq.includes(t)) uniq.push(t)
  }
  return uniq.join('|')
}

function parseOfficialSubTitlePipe(raw: string): string | null {
  const t = String(raw ?? '')
    .replace(/\s+/g, '')
    .trim()
  if (!t) return null
  const parts = t.split('|').filter(Boolean)
  if (parts.length === 0) return null
  if (!parts.every((p) => OFFICIAL_TAG_RE.test(p))) return null
  return parts.join('|')
}

export function extractDouyinSubTitleTradeContextFromErp(
  erp: Record<string, unknown>,
): DouyinSubTitleTradeContext {
  const trade =
    erp.trade_rules && typeof erp.trade_rules === 'object'
      ? (erp.trade_rules as Record<string, unknown>)
      : {}
  return {
    afterSalePolicy: String(trade.after_sale_policy ?? 'refund_anytime'),
    reserveMode: String(trade.reserve_mode ?? 'none'),
    reserveAdvanceDays: Number(trade.reserve_advance_value) || 1,
    consumeValidDays: Number(trade.consume_valid_days) || 360,
  }
}

export function finalizeDouyinSubTitleValue(
  raw: string,
  tradeCtx: DouyinSubTitleTradeContext,
): string {
  const official = parseOfficialSubTitlePipe(raw)
  if (official) return official
  return buildDouyinSubTitleFromTradeRules(tradeCtx)
}

/** @deprecated 使用 finalizeDouyinSubTitleValue + tradeCtx */
export function normalizeDouyinSubTitle(
  raw: string,
  _productName: string,
  _maxLenOverride?: number,
  _categoryId?: string,
): string {
  return finalizeDouyinSubTitleValue(raw, {})
}

export function finalizeDouyinSubTitleInProductAttrs(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
  ctx: {
    tradeRules: DouyinSubTitleTradeContext
  },
): void {
  const tradeCtx = ctx.tradeRules
  const meta = templateProductAttrs.find((a) =>
    attrKeyIsDouyinSubTitle(String((a as Record<string, unknown>).key ?? '')),
  )
  const isRequired = meta ? Boolean((meta as Record<string, unknown>).is_required) : false

  for (const key of Object.keys(merged)) {
    if (attrKeyIsDouyinSubTitle(key)) {
      merged[key] = finalizeDouyinSubTitleValue(merged[key] ?? '', tradeCtx)
    } else if (attrKeyIsDouyinProductNameHint(key)) {
      const v = (merged[key] ?? '').trim()
      if (v) delete merged[key]
    }
  }

  if (!Object.keys(merged).some(attrKeyIsDouyinSubTitle) && isRequired) {
    merged.SubTitle = buildDouyinSubTitleFromTradeRules(tradeCtx)
  }
}

export function sanitizeDouyinProductAttrSubTitleFields(
  merged: Record<string, string>,
  _productName: string,
  _maxLenOverride?: number,
  _categoryId?: string,
  _productDesc = '',
  _descriptionShort?: string,
  tradeRules: DouyinSubTitleTradeContext = {},
): void {
  finalizeDouyinSubTitleInProductAttrs([], merged, { tradeRules })
}

/** @deprecated 不再用商品名比较；SubTitle 为政策标签 */
export function subTitleSimilarToProductName(_subTitle: string, _productName: string): boolean {
  return false
}

/** @deprecated */
export function deriveDistinctDouyinSubTitle(
  _productName: string,
  _productDesc: string,
  _descriptionShort: string | undefined,
  _categoryId?: string,
  _maxLenOverride?: number,
): string {
  return buildDouyinSubTitleFromTradeRules({})
}

/** @deprecated */
export function douyinSubTitleMaxLen(override?: number, _categoryId?: string): number {
  if (override != null && Number.isFinite(override) && override >= 4 && override <= 120) {
    return Math.floor(override)
  }
  return 80
}

/** @deprecated */
export function douyinSubTitleMinLen(_categoryId?: string): number {
  return 4
}
