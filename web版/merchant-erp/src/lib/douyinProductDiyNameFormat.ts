/**
 * 零售代金券 template.get 常见 attr：
 * - product_diy_name：C 端展示名，须符合「xx代yy」面值格式（勿传完整营销标题）
 * - platform_unified_description：是否使用平台统一说明（BOOL → "true"/"false"）
 */
import { parseDouyinTemplateAttrMeta } from './douyinNoteRichTextFormat.js'

/** 来客代金券展示名：售价元代面值，如 90代100 */
const VOUCHER_DAI_NAME_RE = /^(\d{1,6})代(\d{1,6})$/

export function attrKeyIsDouyinProductDiyName(key: string): boolean {
  return /^product_diy_name$/i.test(String(key ?? '').trim())
}

export function attrKeyIsDouyinPlatformUnifiedDescription(key: string): boolean {
  return /^platform_unified_description$/i.test(String(key ?? '').trim())
}

export function isDouyinVoucherDaiNameFormat(value: string): boolean {
  return VOUCHER_DAI_NAME_RE.test(String(value ?? '').replace(/\s+/g, '').trim())
}

/** 从营销标题或价格推导「90代100」 */
export function buildDouyinVoucherProductDiyName(
  productName: string,
  actualAmountFen: number,
  originAmountFen: number,
): string {
  const fromName = String(productName ?? '').match(/(\d{1,6})\s*代\s*(\d{1,6})/)
  if (fromName) {
    const v = `${fromName[1]}代${fromName[2]}`
    if (isDouyinVoucherDaiNameFormat(v)) return v
  }
  const actualYuan = Math.max(1, Math.round(Number(actualAmountFen) / 100))
  let originYuan = Math.max(1, Math.round(Number(originAmountFen) / 100))
  if (originYuan < actualYuan) originYuan = actualYuan
  return `${actualYuan}代${originYuan}`
}

function stripMarketingFromDiyNameCandidate(raw: string): string {
  return String(raw ?? '')
    .replace(/代金券/g, '')
    .replace(/优惠券/g, '')
    .replace(/\s+/g, '')
    .trim()
}

export function normalizeDouyinProductDiyNameValue(
  raw: string,
  ctx: {
    productName: string
    actualAmountFen: number
    originAmountFen: number
  },
): string {
  const stripped = stripMarketingFromDiyNameCandidate(raw)
  if (isDouyinVoucherDaiNameFormat(stripped)) return stripped
  const fromRaw = stripped.match(/(\d{1,6})代(\d{1,6})/)
  if (fromRaw) {
    const v = `${fromRaw[1]}代${fromRaw[2]}`
    if (isDouyinVoucherDaiNameFormat(v)) return v
  }
  return buildDouyinVoucherProductDiyName(
    ctx.productName,
    ctx.actualAmountFen,
    ctx.originAmountFen,
  )
}

export function normalizeDouyinPlatformUnifiedDescriptionValue(
  raw: string,
  valueType: string,
): string {
  const vt = String(valueType ?? '').toUpperCase()
  const t = String(raw ?? '').trim().toLowerCase()
  if (vt === 'BOOL' || vt === 'BOOLEAN') {
    if (t === 'false' || t === '0' || t === 'no') return 'false'
    return 'true'
  }
  if (!t || t === 'false' || t === '0') return 'true'
  if (t === 'true' || t === '1') return 'true'
  /** 误写入长文案时回退为启用平台统一说明 */
  if (t.length > 12 || /[\u4e00-\u9fa5]{4,}/.test(t)) return 'true'
  return raw.trim().slice(0, 64) || 'true'
}

export function finalizeDouyinVoucherNameAttrsInProductMap(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
  ctx: {
    productName: string
    actualAmountFen: number
    originAmountFen: number
    isVoucher: boolean
  },
): void {
  const diyCtx = {
    productName: ctx.productName,
    actualAmountFen: ctx.actualAmountFen,
    originAmountFen: ctx.originAmountFen,
  }

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
    return
  }

  for (const raw of templateProductAttrs) {
    const meta = parseDouyinTemplateAttrMeta(raw as Record<string, unknown>)
    const key = meta.key
    if (!key) continue

    if (attrKeyIsDouyinProductDiyName(key)) {
      merged[key] = normalizeDouyinProductDiyNameValue(merged[key] ?? '', diyCtx)
      continue
    }

    if (attrKeyIsDouyinPlatformUnifiedDescription(key)) {
      merged[key] = normalizeDouyinPlatformUnifiedDescriptionValue(
        merged[key] ?? '',
        meta.value_type,
      )
    }
  }

  for (const key of Object.keys(merged)) {
    if (attrKeyIsDouyinProductDiyName(key)) {
      merged[key] = normalizeDouyinProductDiyNameValue(merged[key] ?? '', diyCtx)
    } else if (attrKeyIsDouyinPlatformUnifiedDescription(key)) {
      const meta = templateProductAttrs.find(
        (a) => String((a as Record<string, unknown>).key ?? '').trim() === key,
      )
      const vt = meta
        ? String((meta as Record<string, unknown>).value_type ?? 'BOOL')
        : 'BOOL'
      merged[key] = normalizeDouyinPlatformUnifiedDescriptionValue(merged[key] ?? '', vt)
    }
  }
}

export function describeDouyinProductDiyNameForLog(
  merged: Record<string, string>,
): Record<string, unknown> {
  const key = Object.keys(merged).find(attrKeyIsDouyinProductDiyName)
  const val = key ? String(merged[key] ?? '').trim() : ''
  return {
    product_diy_name_key: key ?? null,
    product_diy_name_len: val.length,
    product_diy_name_value: val.slice(0, 32),
    product_diy_name_is_dai_format: val ? isDouyinVoucherDaiNameFormat(val) : null,
    platform_unified_description: String(merged.platform_unified_description ?? '').trim().slice(0, 16),
  }
}
