export function matchListKeyword(row: Record<string, unknown>, keyword: string, extraFields: string[] = []): boolean {
  const k = String(keyword || '').trim().toLowerCase()
  if (!k) return true
  const parts = [
    row.title,
    row.mpOrderId,
    row.merchantName,
    row.storeName,
    row.region,
    row.category,
    row.platform,
    row.merchantOrderNo,
    row.statusLabel,
    row.hallLabel,
    row.budgetText,
    row.appliedAt,
    row.publishedAt,
    row.signupLabel,
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
