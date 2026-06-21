const listFilters = require('./recruitmentListFilters.js')

function formatDisplayTime(text) {
  const s = String(text || '').trim()
  if (!s) return '—'
  return s.length > 19 ? s.slice(0, 16) : s
}

function formatMs(ms) {
  if (!ms || !Number.isFinite(ms)) return '—'
  const datePart = listFilters.formatHallDeadlineDateText(ms)
  if (!datePart) return '—'
  try {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ms))
    const h = parts.find((p) => p.type === 'hour')?.value
    const mi = parts.find((p) => p.type === 'minute')?.value
    if (h && mi) return `${datePart} ${h}:${mi}`
  } catch (_) {
    const d = new Date(ms)
    const pad = (v) => String(v).padStart(2, '0')
    return `${datePart} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return datePart
}

/** 报名达人页顶部：单号 / 发布 / 截止 */
function buildMpOrderHeroMeta(mp) {
  if (!mp) {
    return { orderNo: '—', publishedAt: '—', deadlineText: '—' }
  }
  const summary = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const deadlineMs = listFilters.resolveDeadlineMs(mp, summary)
  let deadlineText = '—'
  if (deadlineMs > 0) {
    deadlineText = formatMs(deadlineMs)
  } else if (mp.deadline) {
    const parsed = listFilters.parseTs(mp.deadline)
    deadlineText = parsed > 0 ? formatMs(parsed) : formatDisplayTime(mp.deadline)
  }
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
