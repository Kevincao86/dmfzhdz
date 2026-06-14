/** 发布表单数值：禁止负数，最小 0 */
export function clampNonNegativeInput(raw: string): string {
  const s = String(raw ?? '')
  if (s === '' || s === '-') return s === '-' ? '0' : ''
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return s
  if (n < 0) return '0'
  return s
}

export function parseNonNegativeInt(raw: string, fallback = 0): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n)) return Math.max(0, fallback)
  return Math.max(0, n)
}

export function parseNonNegativeFloat(raw: string): number | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return null
  return Math.max(0, n)
}
