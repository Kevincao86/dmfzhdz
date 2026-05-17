import { encodeDouyinNoteRichTextFromPlain } from './douyinNoteRichTextFormat.js'

/** 来客 attr `Description`（商品短描述）：过长、含链接/emoji 或与 product.desc 不一致会报「Description参数不合法」 */
const DEFAULT_DESCRIPTION_MAX_LEN = 200
const DEFAULT_DESCRIPTION_MIN_LEN = 10
/** 零售火锅等类目（如 5003003）平台侧常见上限更短 */
const RETAIL_CATEGORY_DESCRIPTION_MAX_LEN = 40

export function douyinDescriptionMinLen(override?: number): number {
  if (override != null && Number.isFinite(override) && override >= 4 && override <= 60) {
    return Math.floor(override)
  }
  return DEFAULT_DESCRIPTION_MIN_LEN
}

export function douyinDescriptionMaxLen(override?: number, categoryId?: string): number {
  if (override != null && Number.isFinite(override) && override >= 8 && override <= 2000) {
    return Math.floor(override)
  }
  const cid = String(categoryId ?? '').trim()
  if (cid === '5003003') {
    return RETAIL_CATEGORY_DESCRIPTION_MAX_LEN
  }
  return DEFAULT_DESCRIPTION_MAX_LEN
}

/** 仅保留平台常见可接受字符（去链接、电话、emoji、控制符） */
export function stripDouyinDescriptionUnsafeChars(raw: string): string {
  let s = String(raw ?? '')
  s = s.replace(/<[^>]+>/g, '')
  s = s.replace(/[\u0000-\u001f]/g, '')
  s = s.replace(/https?:\/\/\S+/gi, '')
  s = s.replace(/\b1[3-9]\d{9}\b/g, '')
  try {
    s = s.replace(/[\u{10000}-\u{10FFFF}]/gu, '')
  } catch {
    s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
  }
  s = s.replace(/[^\u4e00-\u9fa5a-zA-Z0-9，。、；：！？·\s]/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

export function attrKeyIsDouyinDescription(key: string): boolean {
  return /^description$/i.test(String(key ?? '').trim())
}

function padDouyinDescriptionToMin(s: string, minLen: number, maxLen: number): string {
  if (s.length >= minLen) return s
  const fillers = ['，欢迎到店体验', '，详询门店', '品质团购服务']
  let out = s
  for (const f of fillers) {
    if (out.length >= minLen) break
    out = (out + f).slice(0, maxLen)
  }
  if (out.length < minLen) {
    out = '品质团购欢迎到店体验优质套餐'.slice(0, maxLen)
  }
  return out
}

export function normalizeDouyinDescription(
  raw: string,
  productName: string,
  maxLenOverride?: number,
  minLenOverride?: number,
  categoryId?: string,
): string {
  const maxLen = douyinDescriptionMaxLen(maxLenOverride, categoryId)
  const minLen = douyinDescriptionMinLen(minLenOverride)
  let s = stripDouyinDescriptionUnsafeChars(raw)
  if (s.startsWith('{') || s.startsWith('[')) s = ''
  if (!s) s = String(productName ?? '').trim()
  if (!s) s = '品质团购'
  s = padDouyinDescriptionToMin(s, minLen, maxLen)
  if (s.length > maxLen) s = s.slice(0, maxLen)
  return s
}

export function sanitizeDouyinDescriptionInProductAttrs(
  merged: Record<string, string>,
  productName: string,
  maxLenOverride?: number,
  categoryId?: string,
): string {
  const rawIn =
    merged.Description ??
    merged.description ??
    Object.entries(merged).find(([k]) => attrKeyIsDouyinDescription(k))?.[1] ??
    ''
  const norm = normalizeDouyinDescription(rawIn, productName, maxLenOverride, undefined, categoryId)
  for (const key of Object.keys(merged)) {
    if (attrKeyIsDouyinDescription(key)) merged[key] = norm
  }
  if (!Object.keys(merged).some(attrKeyIsDouyinDescription) && productName.trim()) {
    merged.Description = norm
  }
  return norm
}

/**
 * @deprecated 请使用 applyDouyinProductDescriptionAttrs（douyinProductDescriptionAttrs.ts）
 */
export function applyDouyinDescriptionRichTextSplit(
  merged: Record<string, string>,
  productName: string,
  longDetail: string,
  categoryId?: string,
): string {
  const short = sanitizeDouyinDescriptionInProductAttrs(merged, productName, undefined, categoryId)
  const long = stripDouyinDescriptionUnsafeChars(longDetail).slice(0, 8000) || short
  const noteJson = encodeDouyinNoteRichTextFromPlain(long)
  if (!merged.description_rich_text?.trim() || !merged.description_rich_text.trim().startsWith('[')) {
    merged.description_rich_text = noteJson
  }
  for (const key of Object.keys(merged)) {
    if (attrKeyIsDouyinDescription(key)) merged[key] = '[]'
  }
  if (!Object.keys(merged).some(attrKeyIsDouyinDescription) && productName.trim()) {
    merged.Description = '[]'
  }
  return short
}
