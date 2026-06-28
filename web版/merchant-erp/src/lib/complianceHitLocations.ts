/**
 * AI 合规检核：违禁词位置解析（成片秒数 / 文稿段落）
 */
import type { ComplianceSampleFrameSlot } from '../../vite-plugins/videoConcatServer.js'

export type AsrTimedSegment = {
  text: string
  beginMs: number
  endMs?: number
}

export type VideoComplianceLocation = {
  phrase: string
  source: 'asr' | 'visual' | 'brief' | 'ocr'
  atSec?: number
  timeLabel?: string
  frameSlot?: ComplianceSampleFrameSlot
}

export type ScriptParagraph = {
  index: number
  text: string
}

/** 格式化为 0:12 或 1:05 */
export function formatComplianceTimeLabel(atSec: number): string {
  const sec = Math.max(0, Math.floor(atSec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`
}

export function frameSlotToApproxSec(
  slot: ComplianceSampleFrameSlot,
  durationSec: number | null | undefined,
): number {
  const dur = Number(durationSec)
  if (!Number.isFinite(dur) || dur <= 0) {
    if (slot === 'opening') return 0
    if (slot === 'middle') return 15
    return 30
  }
  if (slot === 'opening') return 0
  if (slot === 'closing') return Math.max(0, Math.round(dur - 1))
  if (dur > 60) return Math.max(0, Math.round(dur - 30))
  return Math.max(0, Math.round(dur / 2))
}

export function splitScriptParagraphs(text: string): ScriptParagraph[] {
  const raw = String(text || '').trim()
  if (!raw) return []
  const blocks = raw.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean)
  if (blocks.length <= 1 && raw.includes('\n')) {
    return raw
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((text, i) => ({ index: i + 1, text }))
  }
  return blocks.map((text, i) => ({ index: i + 1, text }))
}

export function buildNumberedScriptBody(paragraphs: ScriptParagraph[]): string {
  return paragraphs.map((p) => `【第${p.index}段】${p.text}`).join('\n\n')
}

export function findParagraphNoForExcerpt(excerpt: string, paragraphs: ScriptParagraph[]): number | undefined {
  const needle = String(excerpt || '').trim()
  if (!needle || !paragraphs.length) return undefined
  const lower = needle.toLowerCase()
  for (const p of paragraphs) {
    if (p.text.includes(needle) || p.text.toLowerCase().includes(lower)) return p.index
  }
  for (const p of paragraphs) {
    if (needle.length >= 4 && p.text.toLowerCase().includes(lower.slice(0, Math.min(needle.length, 12)))) {
      return p.index
    }
  }
  return undefined
}

export function findPhraseOffsetInText(haystack: string, phrase: string): number {
  const h = String(haystack || '')
  const p = String(phrase || '').trim()
  if (!p) return -1
  let idx = h.indexOf(p)
  if (idx >= 0) return idx
  idx = h.toLowerCase().indexOf(p.toLowerCase())
  return idx
}

/** 在 ASR 句级时间轴上定位短语首次出现秒数 */
export function findAsrPhraseSec(phrase: string, segments: AsrTimedSegment[]): number | undefined {
  const p = String(phrase || '').trim()
  if (!p || !segments.length) return undefined
  const lower = p.toLowerCase()
  for (const seg of segments) {
    if (seg.text.includes(p) || seg.text.toLowerCase().includes(lower)) {
      return Math.max(0, Math.floor(seg.beginMs / 1000))
    }
  }
  const full = segments.map((s) => s.text).join('')
  const idx = findPhraseOffsetInText(full, p)
  if (idx < 0) return undefined
  let cursor = 0
  for (const seg of segments) {
    const next = cursor + seg.text.length
    if (idx < next) return Math.max(0, Math.floor(seg.beginMs / 1000))
    cursor = next
  }
  return undefined
}

export function resolveVideoHitLocations(input: {
  phrases: string[]
  asrText?: string
  asrSegments?: AsrTimedSegment[]
  ocrText?: string
  frameSlotHits?: Array<{ slot: ComplianceSampleFrameSlot; hits: string[] }>
  briefText?: string
  durationSec?: number | null
}): VideoComplianceLocation[] {
  const phrases = [...new Set(input.phrases.map((p) => String(p).trim()).filter(Boolean))].slice(0, 12)
  const out: VideoComplianceLocation[] = []
  const seen = new Set<string>()

  const push = (loc: VideoComplianceLocation) => {
    const key = `${loc.source}|${loc.atSec ?? ''}|${loc.frameSlot ?? ''}|${loc.phrase}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      ...loc,
      timeLabel: loc.atSec != null ? formatComplianceTimeLabel(loc.atSec) : loc.timeLabel,
    })
  }

  for (const phrase of phrases) {
    let placed = false
    const asrSec = findAsrPhraseSec(phrase, input.asrSegments ?? [])
    if (asrSec != null) {
      push({ phrase, source: 'asr', atSec: asrSec })
      placed = true
    } else if (input.asrText && findPhraseOffsetInText(input.asrText, phrase) >= 0) {
      push({ phrase, source: 'asr' })
      placed = true
    }

    for (const row of input.frameSlotHits ?? []) {
      if (!row.hits.some((h) => h === phrase || h.includes(phrase) || phrase.includes(h))) continue
      const atSec = frameSlotToApproxSec(row.slot, input.durationSec)
      push({ phrase, source: 'visual', atSec, frameSlot: row.slot })
      placed = true
    }

    if (!placed && input.ocrText && findPhraseOffsetInText(input.ocrText, phrase) >= 0) {
      push({ phrase, source: 'ocr' })
      placed = true
    }

    if (!placed && input.briefText && findPhraseOffsetInText(input.briefText, phrase) >= 0) {
      push({ phrase, source: 'brief' })
    }
  }

  return out.slice(0, 12)
}

export function formatVideoLocationLine(loc: VideoComplianceLocation): string {
  if (loc.atSec != null) {
    const label = loc.timeLabel || formatComplianceTimeLabel(loc.atSec)
    const src =
      loc.source === 'visual' || loc.source === 'ocr' ? '画面' : loc.source === 'asr' ? '口播' : '视频'
    return `${src}${label}「${loc.phrase}」`
  }
  if (loc.source === 'brief') return `Brief「${loc.phrase}」`
  if (loc.source === 'asr') return `口播「${loc.phrase}」`
  if (loc.source === 'visual' || loc.source === 'ocr') return `画面「${loc.phrase}」`
  return `「${loc.phrase}」`
}

export function buildVideoComplianceLocationMessage(locations: VideoComplianceLocation[]): string {
  if (!locations.length) return ''
  const parts = locations.slice(0, 3).map(formatVideoLocationLine)
  return `可能违规请注意审核：${parts.join('、')}`
}

export function formatScriptParagraphLine(paragraphNo: number | undefined, excerpt: string): string {
  const text = String(excerpt || '').trim().slice(0, 18)
  if (paragraphNo != null && paragraphNo > 0) return `第${paragraphNo}段「${text}」`
  return `「${text}」`
}

export function buildScriptComplianceLocationMessage(
  violations: Array<{ excerpt: string; paragraphNo?: number }>,
): string {
  if (!violations.length) return ''
  const parts = violations
    .slice(0, 2)
    .map((v) => formatScriptParagraphLine(v.paragraphNo, v.excerpt))
    .filter(Boolean)
  if (!parts.length) return ''
  return `可能违规请注意修改：${parts.join('、')}`
}
