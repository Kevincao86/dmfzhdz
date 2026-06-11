/** 大厅招募 AI 标签：按文案语义配色 + 自动保证字/底对比度（Web + 小程序对齐） */

export type HallAiTagStyle = {
  tag: string
  tone: string
  bg: string
  fg: string
}

const TONE_BG: Record<string, string> = {
  hot: '#e8926e',
  urgent: '#ea580c',
  ice: '#6eb5d8',
  match: '#8b7ae8',
  budget: '#d4a574',
  niche: '#6ec4bc',
  default: '#9a8ee0',
}

const TAG_RULES: Array<{ re: RegExp; bg: string; tone: string }> = [
  { re: /剪辑|后期|视频|云剪/, bg: '#8b7ae8', tone: 'match' },
  { re: /美食|餐饮|探店|口播/, bg: '#e8926e', tone: 'hot' },
  { re: /稳定|长期|月|持续/, bg: '#b4a8f0', tone: 'budget' },
  { re: /生活|记录|日常|vlog/i, bg: '#6ec4bc', tone: 'niche' },
  { re: /佣金|高佣|cps/i, bg: '#e07082', tone: 'hot' },
  { re: /急|速|紧/, bg: '#f08a9a', tone: 'urgent' },
  { re: /同城|本地|区域/, bg: '#6bc4a0', tone: 'match' },
  { re: /报价|一口价|阶梯|置换|价/, bg: '#d4a574', tone: 'budget' },
  { re: /粉丝|等级|门槛/, bg: '#7eb8e8', tone: 'ice' },
  { re: /亲子|母婴|儿童/, bg: '#f0a8c8', tone: 'niche' },
]

function clampHex(raw: string): string {
  const s = String(raw || '').trim()
  const m = s.match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return ''
  return `#${m[1].toLowerCase()}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = clampHex(hex)
  if (!h) return null
  const n = parseInt(h.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b)
}

function contrastRatio(bg: string, fg: string): number {
  const l1 = relativeLuminance(bg)
  const l2 = relativeLuminance(fg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** 背景过亮用深字，过暗用白字；对比不足时强制二选一 */
export function ensureTagTextColor(bg: string, preferredFg?: string): string {
  const bgHex = clampHex(bg) || TONE_BG.default
  const pref = clampHex(preferredFg || '')
  if (pref && contrastRatio(bgHex, pref) >= 4.5) return pref
  const white = '#ffffff'
  const dark = '#1e293b'
  const cw = contrastRatio(bgHex, white)
  const cd = contrastRatio(bgHex, dark)
  if (cw >= cd && cw >= 4.5) return white
  if (cd >= 4.5) return dark
  return relativeLuminance(bgHex) > 0.62 ? dark : white
}

function inferFromTagText(tag: string): { bg: string; tone: string } | null {
  const t = String(tag || '').trim()
  if (!t) return null
  for (const rule of TAG_RULES) {
    if (rule.re.test(t)) return { bg: rule.bg, tone: rule.tone }
  }
  return null
}

export function resolveHallAiTagStyle(tag: string, tone?: string): HallAiTagStyle {
  const text = String(tag || '').trim().slice(0, 6)
  const toneKey = String(tone || 'default').trim().toLowerCase() || 'default'
  const inferred = inferFromTagText(text)
  const bg = inferred?.bg || TONE_BG[toneKey] || TONE_BG.default
  const resolvedTone = inferred?.tone || (TONE_BG[toneKey] ? toneKey : 'default')
  const fg = ensureTagTextColor(bg)
  return { tag: text, tone: resolvedTone, bg, fg }
}
