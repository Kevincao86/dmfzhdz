/** 按 schema 列中文标题取单元格 */
export function col(row, title) {
  if (!row || title == null) return ''
  if (Object.prototype.hasOwnProperty.call(row, title)) return row[title]
  const key = String(title)
  for (const [k, v] of Object.entries(row)) {
    if (String(k).trim() === key.trim()) return v
  }
  return ''
}

/** 勾选是否已完成 */
export function isChecked(value) {
  if (value === true || value === 1) return true
  if (value === false || value === 0 || value == null || value === '') return false
  const s = String(value).trim().toLowerCase()
  if (['true', '1', '是', '已完成', '完成', '✓', '✔', 'checked', 'y', 'yes'].includes(s)) {
    return true
  }
  if (['false', '0', '否', '未完成', '未勾选', 'n', 'no'].includes(s)) return false
  return Boolean(s)
}

export function todayLabel(tz = 'Asia/Shanghai') {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function parseDateLoose(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  const s = String(value).trim()
  const m = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function daysAgo(n) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

export function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const s = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
