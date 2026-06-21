const RETENTION_MS = 7 * 86400000

function parseTs(text) {
  if (!text) return 0
  const t = Date.parse(String(text).trim().replace(/-/g, '/'))
  return Number.isFinite(t) ? t : 0
}

function pickField(summary, key) {
  const re = new RegExp(`${key}[:：]([^；;\\n]+)`)
  const m = String(summary || '').match(re)
  return m ? m[1].trim() : ''
}

function resolveDeadlineMs(mp) {
  if (!mp) return 0
  const summary = String(mp.recruitmentInfo || mp.taskDetail || '')
  const fromField =
    parseTs(mp.deadline) ||
    parseTs(pickField(summary, '报名截止')) ||
    parseTs(pickField(summary, '截止')) ||
    parseTs(pickField(summary, '截止时间'))
  if (fromField > 0) return fromField
  const pub = parseTs(mp.createdAt || mp.updatedAt)
  if (mp.urgent && pub > 0) return pub + 86400000
  return pub > 0 ? pub + RETENTION_MS : 0
}

function isGroupQrExpired(mp, nowMs) {
  const deadlineMs = resolveDeadlineMs(mp)
  if (deadlineMs <= 0) return false
  const now = nowMs == null ? Date.now() : nowMs
  return now > deadlineMs + RETENTION_MS
}

module.exports = {
  RETENTION_MS,
  RETENTION_DAYS: 7,
  resolveDeadlineMs,
  isGroupQrExpired,
}
