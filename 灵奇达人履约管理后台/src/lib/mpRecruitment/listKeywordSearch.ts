const ORDER_NO_RE = /^MP-(RO|ICE|USER)-/i

export function looksLikeOrderNoSearch(keyword: string): boolean {
  const k = String(keyword || '').trim()
  if (!k) return false
  if (ORDER_NO_RE.test(k)) return true
  if (/^MP-/i.test(k) && k.length >= 8) return true
  return false
}

function orderIdFields(row: Record<string, unknown>): string[] {
  return [row.id, row.mpOrderId, row.merchantOrderNo, row.sourceMerchantOrderId]
    .filter((v) => v != null && String(v).trim())
    .map((v) => String(v).trim())
}

/** 关键词是否命中商单号 / 招募单 id 字段 */
export function matchesOrderIdKeyword(row: Record<string, unknown>, keyword: string): boolean {
  const k = String(keyword || '').trim().toLowerCase()
  if (!k) return false
  return orderIdFields(row).some((field) => field.toLowerCase().includes(k))
}

export function matchListKeyword(row: Record<string, unknown>, keyword: string, extraFields: string[] = []): boolean {
  const k = String(keyword || '').trim().toLowerCase()
  if (!k) return true
  const parts = [
    row.id,
    row.title,
    row.mpOrderId,
    row.merchantName,
    row.storeName,
    row.region,
    row.category,
    row.platform,
    row.merchantOrderNo,
    row.sourceMerchantOrderId,
    row.statusLabel,
    row.hallLabel,
    row.budgetText,
    row.appliedAt,
    row.publishedAt,
    row.signupLabel,
    row.signupCountText,
    row.deadlineDaysText,
    ...extraFields,
  ]
  const blob = parts
    .filter((v) => v != null && String(v).trim())
    .map((v) => String(v))
    .join(' ')
    .toLowerCase()
  return blob.includes(k)
}
