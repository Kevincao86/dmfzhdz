/** 发布表单数值：禁止负数，最小 0 */
function clampNonNegativeInput(raw) {
  const s = String(raw == null ? '' : raw)
  if (s === '' || s === '-') return s === '-' ? '0' : ''
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return s
  if (n < 0) return '0'
  return s
}

function parseNonNegativeInt(raw, fallback) {
  const fb = fallback == null ? 0 : fallback
  const n = Number.parseInt(String(raw == null ? '' : raw).trim(), 10)
  if (!Number.isFinite(n)) return Math.max(0, fb)
  return Math.max(0, n)
}

const PUBLISH_NON_NEGATIVE_KEYS = new Set([
  'fixedPrice',
  'cpsPercent',
  'recruitCount',
  'selfQuoteMin',
  'selfQuoteMax',
  'fansMin',
  'fansMax',
  'liveDuration',
])

module.exports = {
  clampNonNegativeInput,
  parseNonNegativeInt,
  PUBLISH_NON_NEGATIVE_KEYS,
}
