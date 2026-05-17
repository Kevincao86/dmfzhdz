/**
 * 零售代金券 template.get 常见 attr：
 * - product_diy_name：与顶层 product_name 对齐；启用 platform_unified_description 时通常不应再传
 * - platform_unified_description：BOOL/INT → "true"/"false" 或 "1"/"0"
 */
import {
  parseDouyinTemplateAttrMeta,
  type DouyinTemplateAttrMeta,
} from './douyinNoteRichTextFormat.js'

/** 代金券面值段：90代100 */
const VOUCHER_DAI_CORE_RE = /^(\d{1,6})代(\d{1,6})$/

export type DouyinProductDiyNameApplyStrategy =
  | 'default'
  | 'omit_diy'
  | 'diy_sync_title'
  | 'diy_dai_only'
  | 'unified_off_full_diy'

export function attrKeyIsDouyinProductDiyName(key: string): boolean {
  return /^product_diy_name$/i.test(String(key ?? '').trim())
}

export function attrKeyIsDouyinPlatformUnifiedDescription(key: string): boolean {
  return /^platform_unified_description$/i.test(String(key ?? '').trim())
}

export function isDouyinVoucherDaiCoreFormat(value: string): boolean {
  return VOUCHER_DAI_CORE_RE.test(String(value ?? '').replace(/\s+/g, '').trim())
}

export function findDouyinProductDiyNameTemplateMeta(
  templateProductAttrs: Record<string, unknown>[],
): (DouyinTemplateAttrMeta & { value_demo?: string }) | null {
  for (const raw of templateProductAttrs) {
    const meta = parseDouyinTemplateAttrMeta(raw as Record<string, unknown>)
    if (attrKeyIsDouyinProductDiyName(meta.key)) {
      return {
        ...meta,
        value_demo: String((raw as Record<string, unknown>).value_demo ?? ''),
      }
    }
  }
  return null
}

export function findDouyinPlatformUnifiedTemplateMeta(
  templateProductAttrs: Record<string, unknown>[],
): (DouyinTemplateAttrMeta & { value_demo?: string }) | null {
  for (const raw of templateProductAttrs) {
    const meta = parseDouyinTemplateAttrMeta(raw as Record<string, unknown>)
    if (attrKeyIsDouyinPlatformUnifiedDescription(meta.key)) {
      return {
        ...meta,
        value_demo: String((raw as Record<string, unknown>).value_demo ?? ''),
      }
    }
  }
  return null
}

/** 从营销标题或价格推导面值段「90代100」 */
export function buildDouyinVoucherDaiCoreName(
  productName: string,
  actualAmountFen: number,
  originAmountFen: number,
): string {
  const fromName = String(productName ?? '').match(/(\d{1,6})\s*代\s*(\d{1,6})/)
  if (fromName) {
    const v = `${fromName[1]}代${fromName[2]}`
    if (isDouyinVoucherDaiCoreFormat(v)) return v
  }
  const actualYuan = Math.max(1, Math.round(Number(actualAmountFen) / 100))
  let originYuan = Math.max(1, Math.round(Number(originAmountFen) / 100))
  if (originYuan < actualYuan) originYuan = actualYuan
  return `${actualYuan}代${originYuan}`
}

/**
 * 来客代金券顶层商品名：须含「xx代yy」且建议带「元代金券」后缀（与售价/面值一致）。
 * 例：90代100元代金券
 */
export function normalizeDouyinVoucherProductTitle(
  productName: string,
  actualAmountFen: number,
  originAmountFen: number,
): string {
  const raw = String(productName ?? '').replace(/\s+/g, '').trim()
  const dai = buildDouyinVoucherDaiCoreName(raw, actualAmountFen, originAmountFen)
  if (!dai) return raw.slice(0, 120) || '代金券'

  if (/代金券/.test(raw) && raw.includes(dai)) {
    return raw.slice(0, 120)
  }
  if (/元代金券$/.test(raw) && raw.startsWith(dai)) {
    return raw.slice(0, 120)
  }
  if (raw === dai || raw === `${dai}元`) {
    return `${dai}元代金券`.slice(0, 120)
  }
  if (/^[\u4e00-\u9fa5a-zA-Z0-9]{0,20}$/.test(raw) && !raw.includes('代')) {
    return `${raw}${dai}元代金券`.slice(0, 120)
  }
  return `${dai}元代金券`.slice(0, 120)
}

function platformUnifiedUsesNumericString(meta: DouyinTemplateAttrMeta | null): boolean {
  if (!meta) return false
  const vt = meta.value_type.toUpperCase()
  if (vt === 'INT64' || vt === 'INT' || vt === 'LONG' || vt === 'NUMBER') return true
  const demo = String((meta as { value_demo?: string }).value_demo ?? '')
  return /^1[\s\-–—]/.test(demo) || /\b1\s*[-–—]\s*是/.test(demo)
}

export function normalizeDouyinPlatformUnifiedDescriptionValue(
  raw: string,
  valueType: string,
  valueDemo = '',
): string {
  const vt = String(valueType ?? '').toUpperCase()
  const t = String(raw ?? '').trim().toLowerCase()
  const numericPreferred =
    vt === 'INT64' ||
    vt === 'INT' ||
    vt === 'LONG' ||
    vt === 'NUMBER' ||
    /^1[\s\-–—]/.test(valueDemo) ||
    /\b1\s*[-–—]\s*是/.test(valueDemo)

  const truthy = t === 'true' || t === '1' || t === 'yes'
  const falsy = t === 'false' || t === '0' || t === 'no'

  if (numericPreferred) {
    if (falsy) return '0'
    return '1'
  }
  if (vt === 'BOOL' || vt === 'BOOLEAN') {
    if (falsy) return 'false'
    return 'true'
  }
  if (falsy) return 'false'
  if (truthy) return 'true'
  if (!t || /[\u4e00-\u9fa5]{4,}/.test(t) || t.length > 12) {
    return numericPreferred ? '1' : 'true'
  }
  return raw.trim().slice(0, 64) || (numericPreferred ? '1' : 'true')
}

export function isDouyinPlatformUnifiedDescriptionEnabled(val: string): boolean {
  const t = String(val ?? '').trim().toLowerCase()
  return t === 'true' || t === '1' || t === 'yes'
}

function wrapDiyNameForTemplate(meta: DouyinTemplateAttrMeta | null, plain: string): string {
  const v = plain.trim().slice(0, 120)
  if (!meta?.is_multi) return v
  return JSON.stringify([v])
}

export function applyDouyinProductDiyNameStrategy(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
  ctx: {
    canonicalTitle: string
    daiCore: string
    strategy: DouyinProductDiyNameApplyStrategy
  },
): void {
  const diyMeta = findDouyinProductDiyNameTemplateMeta(templateProductAttrs)
  const unifiedMeta = findDouyinPlatformUnifiedTemplateMeta(templateProductAttrs)
  const unifiedKey = unifiedMeta?.key ?? 'platform_unified_description'
  const diyKey = diyMeta?.key ?? 'product_diy_name'

  let unifiedVal = unifiedMeta
    ? normalizeDouyinPlatformUnifiedDescriptionValue(
        merged[unifiedKey] ?? '',
        unifiedMeta.value_type,
        unifiedMeta.value_demo ?? '',
      )
    : merged[unifiedKey] ?? ''

  switch (ctx.strategy) {
    case 'omit_diy':
      if (unifiedMeta) merged[unifiedKey] = platformUnifiedUsesNumericString(unifiedMeta) ? '1' : 'true'
      delete merged[diyKey]
      return
    case 'unified_off_full_diy':
      if (unifiedMeta) {
        merged[unifiedKey] = platformUnifiedUsesNumericString(unifiedMeta) ? '0' : 'false'
      }
      merged[diyKey] = wrapDiyNameForTemplate(diyMeta, ctx.canonicalTitle)
      return
    case 'diy_dai_only':
      if (unifiedMeta) {
        merged[unifiedKey] = platformUnifiedUsesNumericString(unifiedMeta) ? '0' : 'false'
      }
      merged[diyKey] = wrapDiyNameForTemplate(diyMeta, ctx.daiCore)
      return
    case 'diy_sync_title':
      if (unifiedMeta) {
        merged[unifiedKey] = platformUnifiedUsesNumericString(unifiedMeta) ? '0' : 'false'
      }
      merged[diyKey] = wrapDiyNameForTemplate(diyMeta, ctx.canonicalTitle)
      return
    case 'default':
    default:
      break
  }

  if (unifiedMeta) {
    merged[unifiedKey] = unifiedVal
  }

  const unifiedOn = isDouyinPlatformUnifiedDescriptionEnabled(merged[unifiedKey] ?? unifiedVal)

  /** 默认：启用平台统一说明时不传 product_diy_name（与来客后台一致，避免与顶层名称冲突） */
  if (unifiedOn) {
    delete merged[diyKey]
    return
  }

  if (diyMeta || merged[diyKey] != null) {
    merged[diyKey] = wrapDiyNameForTemplate(diyMeta, ctx.canonicalTitle)
  }
}

export function finalizeDouyinVoucherNameAttrsInProductMap(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
  ctx: {
    productName: string
    actualAmountFen: number
    originAmountFen: number
    isVoucher: boolean
    strategy?: DouyinProductDiyNameApplyStrategy
  },
): { canonicalTitle: string; daiCore: string } {
  const canonicalTitle = normalizeDouyinVoucherProductTitle(
    ctx.productName,
    ctx.actualAmountFen,
    ctx.originAmountFen,
  )
  const daiCore = buildDouyinVoucherDaiCoreName(
    canonicalTitle,
    ctx.actualAmountFen,
    ctx.originAmountFen,
  )

  const templateHasDiy = templateProductAttrs.some((a) =>
    attrKeyIsDouyinProductDiyName(String((a as Record<string, unknown>).key ?? '')),
  )
  const templateHasUnified = templateProductAttrs.some((a) =>
    attrKeyIsDouyinPlatformUnifiedDescription(String((a as Record<string, unknown>).key ?? '')),
  )

  if (!ctx.isVoucher && !templateHasDiy && !templateHasUnified) {
    for (const key of Object.keys(merged)) {
      if (attrKeyIsDouyinProductDiyName(key) || attrKeyIsDouyinPlatformUnifiedDescription(key)) {
        delete merged[key]
      }
    }
    return { canonicalTitle, daiCore }
  }

  applyDouyinProductDiyNameStrategy(templateProductAttrs, merged, {
    canonicalTitle,
    daiCore,
    strategy: ctx.strategy ?? 'default',
  })

  return { canonicalTitle, daiCore }
}

export function isDouyinProductDiyNameBizError(message: string): boolean {
  return /product_diy_name/i.test(String(message ?? '')) && /不合法|参数|非法|错误/i.test(message)
}

export function describeDouyinProductDiyNameForLog(
  merged: Record<string, string>,
  templateProductAttrs: Record<string, unknown>[] = [],
): Record<string, unknown> {
  const diyMeta = findDouyinProductDiyNameTemplateMeta(templateProductAttrs)
  const unifiedMeta = findDouyinPlatformUnifiedTemplateMeta(templateProductAttrs)
  const diyKey = Object.keys(merged).find(attrKeyIsDouyinProductDiyName)
  const val = diyKey ? String(merged[diyKey] ?? '').trim() : ''
  return {
    product_diy_name_key: diyKey ?? null,
    product_diy_name_len: val.length,
    product_diy_name_value: val.slice(0, 48),
    product_diy_name_is_dai_core: val ? isDouyinVoucherDaiCoreFormat(val.replace(/^\[|]$/g, '')) : null,
    product_diy_name_value_type: diyMeta?.value_type ?? null,
    product_diy_name_is_multi: diyMeta?.is_multi ?? null,
    product_diy_name_value_demo: (diyMeta?.value_demo ?? '').slice(0, 80) || null,
    platform_unified_description: String(
      merged.platform_unified_description ?? merged[unifiedMeta?.key ?? ''] ?? '',
    )
      .trim()
      .slice(0, 16),
    platform_unified_value_type: unifiedMeta?.value_type ?? null,
    product_diy_name_omitted: !diyKey,
  }
}
