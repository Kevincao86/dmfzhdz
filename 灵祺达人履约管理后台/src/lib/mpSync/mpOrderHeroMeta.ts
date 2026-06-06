import { formatDeadlineDaysText } from '../mpRecruitment/listFilters'

function parseTs(text: unknown): number {
  if (!text) return 0
  const t = Date.parse(String(text).trim().replace(/-/g, '/'))
  return Number.isFinite(t) ? t : 0
}

function pickField(summary: string, key: string): string {
  const re = new RegExp(`${key}[:：]([^；;\\n]+)`)
  const m = summary.match(re)
  return m ? m[1].trim() : ''
}

export function resolveDeadlineMs(mp: Record<string, unknown> | null): number {
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
  return pub > 0 ? pub + 7 * 86400000 : 0
}

function formatDisplayTime(text: unknown): string {
  const s = String(text || '').trim()
  if (!s) return '—'
  return s.length > 19 ? s.slice(0, 16) : s
}

function formatMs(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return '—'
  try {
    return new Date(ms).toLocaleString('zh-CN', { hour12: false }).slice(0, 16)
  } catch {
    return '—'
  }
}

export function buildMpOrderHeroMeta(mp: Record<string, unknown> | null) {
  if (!mp) return { orderNo: '—', publishedAt: '—', deadlineText: '—' }
  const summary = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const deadlineMs = resolveDeadlineMs(mp)
  let deadlineText = formatDisplayTime(mp.deadline)
  if (deadlineText === '—' && deadlineMs > 0) deadlineText = formatMs(deadlineMs)
  if (deadlineText === '—' && mp.urgent) deadlineText = formatDeadlineDaysText(deadlineMs)
  return {
    orderNo: String(mp.id || '—'),
    publishedAt: formatDisplayTime(mp.createdAt || mp.updatedAt),
    deadlineText,
  }
}
