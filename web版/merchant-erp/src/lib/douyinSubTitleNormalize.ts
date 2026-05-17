import { stripDouyinDescriptionUnsafeChars } from './douyinDescriptionNormalize.js'

const DEFAULT_SUBTITLE_MAX_LEN = 12
const DEFAULT_SUBTITLE_MIN_LEN = 4
/** 零售火锅等类目（5003003）副标题常见下限更长，过短易报「SubTitle参数不合法」 */
const RETAIL_SUBTITLE_MIN_LEN = 8
const RETAIL_SUBTITLE_MAX_LEN = 12

/** 来客 goodlife attr `SubTitle`：短卖点文案，过长、过短或与主标题雷同会报「SubTitle参数不合法」 */
export function douyinSubTitleMaxLen(override?: number, categoryId?: string): number {
  if (override != null && Number.isFinite(override) && override >= 4 && override <= 60) {
    return Math.floor(override)
  }
  const cid = String(categoryId ?? '').trim()
  if (cid === '5003003') return RETAIL_SUBTITLE_MAX_LEN
  return DEFAULT_SUBTITLE_MAX_LEN
}

export function douyinSubTitleMinLen(categoryId?: string): number {
  const cid = String(categoryId ?? '').trim()
  if (cid === '5003003') return RETAIL_SUBTITLE_MIN_LEN
  return DEFAULT_SUBTITLE_MIN_LEN
}

export function attrKeyIsDouyinSubTitle(key: string): boolean {
  return /^subtitle$/i.test(String(key ?? '').trim())
}

export function attrKeyIsDouyinProductNameHint(key: string): boolean {
  return /^product_name_hint$/i.test(String(key ?? '').trim())
}

function stripForSubTitleCompare(raw: string): string {
  return String(raw ?? '')
    .replace(/\s+/g, '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9·]/g, '')
    .trim()
}

/** 与主标题相同、或为主标题/副标题的前缀子串时，抖音常拒收 */
export function subTitleSimilarToProductName(subTitle: string, productName: string): boolean {
  const a = stripForSubTitleCompare(subTitle)
  const b = stripForSubTitleCompare(productName)
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 4 && b.startsWith(a)) return true
  if (b.length >= 4 && a.startsWith(b)) return true
  return false
}

function padDouyinSubTitleToMin(s: string, minLen: number, maxLen: number): string {
  let out = s
  const fillers = ['到店可用', '品质优选', '欢迎选购', '限时特惠']
  for (const f of fillers) {
    if (out.length >= minLen) break
    out = (out + f).slice(0, maxLen)
  }
  if (out.length < minLen) {
    out = '品质团购特惠'.slice(0, maxLen)
  }
  return out
}

/**
 * 生成与主标题明显区分的短卖点（零售类目优先 8～12 字）。
 */
export function deriveDistinctDouyinSubTitle(
  productName: string,
  productDesc: string,
  descriptionShort: string | undefined,
  categoryId?: string,
  maxLenOverride?: number,
): string {
  const maxLen = douyinSubTitleMaxLen(maxLenOverride, categoryId)
  const minLen = douyinSubTitleMinLen(categoryId)
  const nameNorm = stripForSubTitleCompare(productName)

  const candidates: string[] = []

  const descNorm = stripForSubTitleCompare(stripDouyinDescriptionUnsafeChars(productDesc).slice(0, 120))
  if (descNorm && !subTitleSimilarToProductName(descNorm, productName)) {
    candidates.push(descNorm)
  }

  const shortNorm = stripForSubTitleCompare(descriptionShort ?? '')
  if (shortNorm && !subTitleSimilarToProductName(shortNorm, productName)) {
    candidates.push(shortNorm)
  }

  if (nameNorm.length >= 2) {
    const tail = nameNorm.slice(-Math.min(6, nameNorm.length))
    if (tail.length >= 2) {
      candidates.push(`${tail}到店可用`, `${tail}品质优选`)
    }
  }

  for (const fixed of ['品质团购特惠', '门店优惠团购', '欢迎到店选购', '限时特惠套餐']) {
    candidates.push(fixed)
  }

  for (const raw of candidates) {
    let s = raw.replace(/[^\u4e00-\u9fa5a-zA-Z0-9·]/g, '').slice(0, maxLen)
    s = padDouyinSubTitleToMin(s, minLen, maxLen)
    if (!subTitleSimilarToProductName(s, productName)) return s
  }

  return padDouyinSubTitleToMin('品质团购特惠', minLen, maxLen)
}

/**
 * 规范副标题：去空白/标点噪音、满足类目上下限，且不与商品名雷同。
 */
export function finalizeDouyinSubTitleValue(
  raw: string,
  productName: string,
  productDesc: string,
  descriptionShort: string | undefined,
  categoryId?: string,
  maxLenOverride?: number,
): string {
  const maxLen = douyinSubTitleMaxLen(maxLenOverride, categoryId)
  const minLen = douyinSubTitleMinLen(categoryId)

  let s = String(raw ?? '')
    .replace(/\s+/g, '')
    .trim()
  if (s.startsWith('{') || s.startsWith('[')) s = ''
  const clause = (s.split(/[。，；！？\n]/)[0] ?? s).trim()
  s = clause.replace(/[^\u4e00-\u9fa5a-zA-Z0-9·]/g, '')

  if (!s || subTitleSimilarToProductName(s, productName)) {
    s = deriveDistinctDouyinSubTitle(productName, productDesc, descriptionShort, categoryId, maxLenOverride)
  }

  s = padDouyinSubTitleToMin(s.slice(0, maxLen), minLen, maxLen)

  if (subTitleSimilarToProductName(s, productName)) {
    s = deriveDistinctDouyinSubTitle(productName, productDesc, descriptionShort, categoryId, maxLenOverride)
  }

  return s.slice(0, maxLen)
}

/** @deprecated 请使用 finalizeDouyinSubTitleValue */
export function normalizeDouyinSubTitle(
  raw: string,
  productName: string,
  maxLenOverride?: number,
  categoryId?: string,
): string {
  return finalizeDouyinSubTitleValue(raw, productName, '', undefined, categoryId, maxLenOverride)
}

export function finalizeDouyinSubTitleInProductAttrs(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
  ctx: {
    productName: string
    productDesc: string
    descriptionShort?: string
    categoryId?: string
    maxLenOverride?: number
  },
): void {
  const pn = ctx.productName.trim()
  const meta = templateProductAttrs.find((a) =>
    attrKeyIsDouyinSubTitle(String((a as Record<string, unknown>).key ?? '')),
  )
  const isRequired = meta ? Boolean((meta as Record<string, unknown>).is_required) : true

  for (const key of Object.keys(merged)) {
    if (attrKeyIsDouyinSubTitle(key)) {
      merged[key] = finalizeDouyinSubTitleValue(
        merged[key] ?? '',
        pn,
        ctx.productDesc,
        ctx.descriptionShort,
        ctx.categoryId,
        ctx.maxLenOverride,
      )
    } else if (attrKeyIsDouyinProductNameHint(key)) {
      const v = (merged[key] ?? '').trim()
      if (v.length > 80 || (v.includes('。') && v.length > 40)) {
        merged[key] = finalizeDouyinSubTitleValue(
          v,
          pn,
          ctx.productDesc,
          ctx.descriptionShort,
          ctx.categoryId,
          ctx.maxLenOverride,
        )
      } else if (!v) {
        delete merged[key]
      }
    }
  }

  if (!Object.keys(merged).some(attrKeyIsDouyinSubTitle) && pn && isRequired) {
    merged.SubTitle = finalizeDouyinSubTitleValue(
      '',
      pn,
      ctx.productDesc,
      ctx.descriptionShort,
      ctx.categoryId,
      ctx.maxLenOverride,
    )
  }
}

export function sanitizeDouyinProductAttrSubTitleFields(
  merged: Record<string, string>,
  productName: string,
  maxLenOverride?: number,
  categoryId?: string,
  productDesc = '',
  descriptionShort?: string,
): void {
  finalizeDouyinSubTitleInProductAttrs([], merged, {
    productName,
    productDesc,
    descriptionShort,
    categoryId,
    maxLenOverride,
  })
}
