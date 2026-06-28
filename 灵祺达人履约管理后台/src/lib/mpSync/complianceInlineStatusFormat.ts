/**
 * AI 检核结果 → 列表行内展示文案（成片 / 文稿）
 */
export type VideoAiInlineStatus = {
  text: string
  tone: 'checking' | 'pass' | 'warn' | ''
}

function formatComplianceClock(atSec: number): string {
  const sec = Math.max(0, Math.floor(Number(atSec) || 0))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`
}

function formatVideoLocationPart(loc: Record<string, unknown>): string {
  const phrase = String(loc.phrase || '').trim()
  if (!phrase) return ''
  const atSec = loc.atSec
  if (atSec != null && Number.isFinite(Number(atSec))) {
    const label = String(loc.timeLabel || '').trim() || formatComplianceClock(Number(atSec))
    const source = String(loc.source || '')
    const src =
      source === 'visual' || source === 'ocr' ? '画面' : source === 'asr' ? '口播' : '视频'
    return `${src}${label}「${phrase}」`
  }
  if (loc.source === 'brief') return `Brief「${phrase}」`
  if (loc.source === 'asr') return `口播「${phrase}」`
  if (loc.source === 'visual' || loc.source === 'ocr') return `画面「${phrase}」`
  return `「${phrase}」`
}

export function formatVideoComplianceInline(
  res: Record<string, unknown> | null | undefined,
): VideoAiInlineStatus {
  if (!res || res.verdict === 'normal') {
    return { text: 'AI检测通过', tone: 'pass' }
  }
  const locations = Array.isArray(res.locations) ? res.locations : []
  if (locations.length) {
    const parts = locations
      .map((loc) => formatVideoLocationPart(loc as Record<string, unknown>))
      .filter(Boolean)
      .slice(0, 3)
    if (parts.length) {
      return {
        text: `AI检测到（${parts.join('、')}）请注意修改`.slice(0, 80),
        tone: 'warn',
      }
    }
  }
  const hits = Array.isArray(res.hits)
    ? res.hits.map((h) => String(h).trim()).filter(Boolean)
    : []
  const msg = String(res.message || '')
  const secMatch = msg.match(/(\d+)\s*秒/)
  if (secMatch) {
    return {
      text: `AI检测到（视频${secMatch[1]}秒处出现违禁词）请注意修改`,
      tone: 'warn',
    }
  }
  if (hits.length) {
    const words = hits.slice(0, 2).join('、')
    return { text: `AI检测到（${words}）请注意修改`, tone: 'warn' }
  }
  if (msg && /可能违规|请注意/.test(msg)) {
    return { text: msg.slice(0, 80), tone: 'warn' }
  }
  return { text: 'AI检测到可能违规内容，请注意修改', tone: 'warn' }
}

export function formatScriptComplianceInline(
  res: Record<string, unknown> | null | undefined,
): VideoAiInlineStatus {
  if (!res || res.verdict === 'normal') {
    return { text: 'AI检测通过', tone: 'pass' }
  }
  const violations = Array.isArray(res.violations) ? res.violations : []
  if (violations.length) {
    const v = (violations[0] || {}) as Record<string, unknown>
    const excerpt = String(v.excerpt || '').trim()
    const suggestion = String(v.suggestion || '').trim()
    const rule = String(v.rule || '').trim()
    const paragraphNo = typeof v.paragraphNo === 'number' && v.paragraphNo > 0 ? v.paragraphNo : 0
    let text = 'AI检测到可能违规内容'
    if (excerpt) {
      text =
        paragraphNo > 0
          ? `第${paragraphNo}段「${excerpt.slice(0, 16)}」可能违规`
          : `「${excerpt.slice(0, 18)}」可能违规`
    }
    if (suggestion) text += `，建议：${suggestion.slice(0, 24)}`
    else if (rule) text += `（${rule.slice(0, 18)}）`
    return { text: text.slice(0, 80), tone: 'warn' }
  }
  const hits = Array.isArray(res.hits) ? res.hits.map((h) => String(h).trim()).filter(Boolean) : []
  const msg = String(res.message || '')
  if (msg && /第\d+段/.test(msg)) {
    return { text: msg.slice(0, 80), tone: 'warn' }
  }
  if (hits.length) {
    const words = hits.slice(0, 2).join('、')
    return { text: `AI检测到（${words}）请注意修改`, tone: 'warn' }
  }
  if (msg && /[\u4e00-\u9fa5]/.test(msg)) {
    return { text: msg.slice(0, 80), tone: 'warn' }
  }
  return { text: 'AI检测到可能违规内容，请注意修改', tone: 'warn' }
}
