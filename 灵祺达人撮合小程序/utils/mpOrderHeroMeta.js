const listFilters = require('./recruitmentListFilters.js')

function formatDisplayTime(text) {
  const s = String(text || '').trim()
  if (!s) return '—'
  return s.length > 19 ? s.slice(0, 16) : s
}

function formatMs(ms) {
  if (!ms || !Number.isFinite(ms)) return '—'
  try {
    return new Date(ms).toLocaleString('zh-CN', { hour12: false }).slice(0, 16)
  } catch {
    return '—'
  }
}

/** 报名达人页顶部：单号 / 发布 / 截止 */
function buildMpOrderHeroMeta(mp) {
  if (!mp) {
    return { orderNo: '—', publishedAt: '—', deadlineText: '—' }
  }
  const summary = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const deadlineMs = listFilters.resolveDeadlineMs(mp, summary)
  let deadlineText = formatDisplayTime(mp.deadline)
  if (deadlineText === '—' && deadlineMs > 0) deadlineText = formatMs(deadlineMs)
  if (deadlineText === '—' && mp.urgent) {
    deadlineText = listFilters.formatDeadlineDaysText(deadlineMs)
  }
  return {
    orderNo: String(mp.id || '—'),
    publishedAt: formatDisplayTime(mp.createdAt || mp.updatedAt),
    deadlineText,
  }
}

module.exports = { buildMpOrderHeroMeta, formatDisplayTime }
