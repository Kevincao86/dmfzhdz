function normalizeKeyword(keyword) {
  return String(keyword || '').trim().toLowerCase()
}

function matchListKeyword(row, keyword, extraFields) {
  const k = normalizeKeyword(keyword)
  if (!k) return true
  const r = row || {}
  const parts = [
    r.title,
    r.mpOrderId,
    r.merchantName,
    r.storeName,
    r.region,
    r.category,
    r.platform,
    r.merchantOrderNo,
    r.statusLabel,
    r.hallLabel,
    r.budgetText,
    r.appliedAt,
    r.publishedAt,
    r.signupLabel,
    r.deadlineDaysText,
    ...(Array.isArray(extraFields) ? extraFields : []),
  ]
  const blob = parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return blob.includes(k)
}

module.exports = {
  matchListKeyword,
}
