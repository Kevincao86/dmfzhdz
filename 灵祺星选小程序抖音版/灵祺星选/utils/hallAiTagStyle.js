/** 大厅 AI 标签配色（与 web版 merchant-erp hallAiTagStyle 对齐） */

const TONE_BG = {
  hot: '#e8926e',
  urgent: '#ea580c',
  ice: '#6eb5d8',
  match: '#8b7ae8',
  budget: '#d4a574',
  niche: '#6ec4bc',
  default: '#9a8ee0',
}

const TAG_RULES = [
  { re: /美食|餐饮|探店|果园|杨梅|口播/, bg: '#e8926e', tone: 'hot' },
  { re: /稳定|长期|月|持续|官号/, bg: '#b4a8f0', tone: 'budget' },
  { re: /生活|记录|日常|vlog/i, bg: '#6ec4bc', tone: 'niche' },
  { re: /剪辑|后期|视频|云剪/, bg: '#8b7ae8', tone: 'match' },
  { re: /佣金|高佣|cps/i, bg: '#e07082', tone: 'hot' },
  { re: /急|速|紧/, bg: '#f08a9a', tone: 'urgent' },
  { re: /同城|本地|区域/, bg: '#6bc4a0', tone: 'match' },
  { re: /报价|一口价|阶梯|置换|价/, bg: '#d4a574', tone: 'budget' },
  { re: /粉丝|等级|门槛/, bg: '#7eb8e8', tone: 'ice' },
  { re: /亲子|母婴|儿童/, bg: '#f0a8c8', tone: 'niche' },
]

function clampHex(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return ''
  return `#${m[1].toLowerCase()}`
}

function hexToRgb(hex) {
  const h = clampHex(hex)
  if (!h) return null
  const n = parseInt(h.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b)
}

function contrastRatio(bg, fg) {
  const l1 = relativeLuminance(bg)
  const l2 = relativeLuminance(fg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function ensureTagTextColor(bg, preferredFg) {
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

function inferFromTagText(tag) {
  const t = String(tag || '').trim()
  if (!t) return null
  for (let i = 0; i < TAG_RULES.length; i++) {
    const rule = TAG_RULES[i]
    if (rule.re.test(t)) return { bg: rule.bg, tone: rule.tone }
  }
  return null
}

function resolveHallAiTagStyle(tag, tone) {
  const text = String(tag || '').trim().slice(0, 6)
  const toneKey = String(tone || 'default').trim().toLowerCase() || 'default'
  const inferred = inferFromTagText(text)
  const bg = (inferred && inferred.bg) || TONE_BG[toneKey] || TONE_BG.default
  const resolvedTone = (inferred && inferred.tone) || (TONE_BG[toneKey] ? toneKey : 'default')
  const fg = ensureTagTextColor(bg)
  return { tag: text, tone: resolvedTone, bg, fg }
}

function withHallAiTagColors(tag, tone, stored) {
  const text = String(tag || '').trim().slice(0, 6)
  const toneKey = String(tone || 'default').trim() || 'default'
  const storedBg = String((stored && stored.bg) || '').trim()
  const storedFg = String((stored && stored.fg) || '').trim()
  if (storedBg) {
    const fg = ensureTagTextColor(storedBg, storedFg || undefined)
    return { aiTag: text, aiTagTone: toneKey, aiTagBg: storedBg, aiTagFg: fg }
  }
  const s = resolveHallAiTagStyle(text, toneKey)
  return { aiTag: s.tag, aiTagTone: s.tone, aiTagBg: s.bg, aiTagFg: s.fg }
}

module.exports = {
  ensureTagTextColor,
  resolveHallAiTagStyle,
  withHallAiTagColors,
}
