/** 来客 attr `Description`（商品描述）：过长或含 HTML 会报「Description参数不合法」 */
const DEFAULT_DESCRIPTION_MAX_LEN = 200
const DEFAULT_DESCRIPTION_MIN_LEN = 10

export function douyinDescriptionMinLen(override?: number): number {
  if (override != null && Number.isFinite(override) && override >= 4 && override <= 60) {
    return Math.floor(override)
  }
  return DEFAULT_DESCRIPTION_MIN_LEN
}

export function douyinDescriptionMaxLen(override?: number): number {
  if (override != null && Number.isFinite(override) && override >= 8 && override <= 2000) {
    return Math.floor(override)
  }
  return DEFAULT_DESCRIPTION_MAX_LEN
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
): string {
  const maxLen = douyinDescriptionMaxLen(maxLenOverride)
  const minLen = douyinDescriptionMinLen(minLenOverride)
  let s = String(raw ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
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
): void {
  const norm = normalizeDouyinDescription(
    merged.Description ?? merged.description ?? '',
    productName,
    maxLenOverride,
  )
  for (const key of Object.keys(merged)) {
    if (attrKeyIsDouyinDescription(key)) merged[key] = norm
  }
  if (!Object.keys(merged).some(attrKeyIsDouyinDescription) && productName.trim()) {
    merged.Description = norm
  }
}
