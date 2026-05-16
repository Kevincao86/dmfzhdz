const DEFAULT_SUBTITLE_MAX_LEN = 12

/** 来客 goodlife attr `SubTitle`：短卖点文案，过长或像详情会报「SubTitle参数不合法」 */
export function douyinSubTitleMaxLen(override?: number): number {
  if (override != null && Number.isFinite(override) && override >= 4 && override <= 60) {
    return Math.floor(override)
  }
  return DEFAULT_SUBTITLE_MAX_LEN
}

export function attrKeyIsDouyinSubTitle(key: string): boolean {
  return /^subtitle$/i.test(String(key ?? '').trim())
}

export function attrKeyIsDouyinProductNameHint(key: string): boolean {
  return /^product_name_hint$/i.test(String(key ?? '').trim())
}

/**
 * 规范副标题：去空白/标点噪音、截断至平台常见上限（默认 12 字），禁止把整段详情当 SubTitle。
 */
export function normalizeDouyinSubTitle(
  raw: string,
  productName: string,
  maxLenOverride?: number,
): string {
  const maxLen = douyinSubTitleMaxLen(maxLenOverride)
  let s = String(raw ?? '')
    .replace(/\s+/g, '')
    .trim()
  if (s.startsWith('{') || s.startsWith('[')) s = ''
  const clause = (s.split(/[。，；！？\n]/)[0] ?? s).trim()
  s = clause.replace(/[^\u4e00-\u9fa5a-zA-Z0-9·]/g, '')
  if (!s) {
    s = String(productName ?? '')
      .replace(/\s+/g, '')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9·]/g, '')
      .trim()
  }
  if (s.length > maxLen) s = s.slice(0, maxLen)
  if (!s) s = '品质团购'.slice(0, maxLen)
  return s
}

export function sanitizeDouyinProductAttrSubTitleFields(
  merged: Record<string, string>,
  productName: string,
  maxLenOverride?: number,
): void {
  const pn = productName.trim()
  for (const key of Object.keys(merged)) {
    if (attrKeyIsDouyinSubTitle(key)) {
      merged[key] = normalizeDouyinSubTitle(merged[key] ?? '', pn, maxLenOverride)
    } else if (attrKeyIsDouyinProductNameHint(key)) {
      const v = (merged[key] ?? '').trim()
      if (v.length > 80 || (v.includes('。') && v.length > 40)) {
        merged[key] = normalizeDouyinSubTitle(v, pn, maxLenOverride)
      }
    }
  }
  if (!Object.keys(merged).some(attrKeyIsDouyinSubTitle) && pn) {
    merged.SubTitle = normalizeDouyinSubTitle('', pn, maxLenOverride)
  }
}
