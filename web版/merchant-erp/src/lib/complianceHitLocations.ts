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
  source: 'asr' | 'subtitle' | 'visual' | 'brief'
  atSec?: number
  timeLabel?: string
  frameSlot?: ComplianceSampleFrameSlot
}

export type VideoChannelIssue = {
  atSec: number
  timeLabel: string
  phrase: string
}

export type VideoChannelStatus = {
  checked: boolean
  normal: boolean
  issues: VideoChannelIssue[]
}

export type VideoComplianceChannelReport = {
  asr: VideoChannelStatus
  subtitle: VideoChannelStatus
  visual: VideoChannelStatus
}

export type ScriptParagraph = {
  index: number
  text: string
}

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
    if (slot === 'opening') return 1
    if (slot === 'middle') return 15
    return 28
  }
  if (slot === 'opening') return 1
  if (slot === 'closing') return Math.max(1, Math.round(dur - 1))
  if (dur > 60) return Math.max(1, Math.round(dur - 30))
  return Math.max(1, Math.round(dur / 2))
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

function phraseInText(text: string, phrase: string): boolean {
  return findPhraseOffsetInText(text, phrase) >= 0
}

/** ASR 是否含可用时间轴（非全 0） */
export function asrSegmentsHaveTimeline(segments: AsrTimedSegment[]): boolean {
  if (!segments.length) return false
  if (segments.some((s) => s.beginMs > 0)) return true
  const distinct = new Set(segments.map((s) => s.beginMs))
  return distinct.size > 1
}

/** 无时间轴时按文本位置占比估算秒数 */
export function estimatePhraseSecByRatio(
  phrase: string,
  text: string,
  durationSec: number | null | undefined,
): number | undefined {
  const dur = Number(durationSec)
  if (!text || !Number.isFinite(dur) || dur <= 1) return undefined
  const idx = findPhraseOffsetInText(text, phrase)
  if (idx < 0) return undefined
  const ratio = idx / Math.max(text.length, 1)
  let sec = Math.round(ratio * dur)
  if (sec <= 0 && ratio > 0.02) sec = 1
  return Math.max(0, Math.min(Math.floor(dur) - 1, sec))
}

export function findAsrPhraseSec(
  phrase: string,
  segments: AsrTimedSegment[],
  asrText?: string,
  durationSec?: number | null,
): number | undefined {
  const p = String(phrase || '').trim()
  if (!p) return undefined

  if (asrSegmentsHaveTimeline(segments)) {
    const lower = p.toLowerCase()
    for (const seg of segments) {
      if (seg.text.includes(p) || seg.text.toLowerCase().includes(lower)) {
        return Math.max(0, Math.floor(seg.beginMs / 1000))
      }
    }
    const full = segments.map((s) => s.text).join('')
    const idx = findPhraseOffsetInText(full, p)
    if (idx >= 0) {
      let cursor = 0
      for (const seg of segments) {
        const next = cursor + seg.text.length
        if (idx < next) return Math.max(0, Math.floor(seg.beginMs / 1000))
        cursor = next
      }
    }
  }

  if (asrText) {
    const est = estimatePhraseSecByRatio(p, asrText, durationSec)
    if (est != null) return est
  }
  return undefined
}

function dedupePhrases(phrases: string[]): string[] {
  const sorted = [...phrases].sort((a, b) => b.length - a.length)
  const kept: string[] = []
  for (const p of sorted) {
    const t = String(p || '').trim()
    if (!t) continue
    if (kept.some((k) => k.includes(t) || t.includes(k))) continue
    kept.push(t)
  }
  return kept.slice(0, 8)
}

function makeIssue(atSec: number | undefined, phrase: string): VideoChannelIssue | null {
  const p = String(phrase || '').trim()
  if (!p) return null
  if (atSec == null || !Number.isFinite(atSec)) {
    return { atSec: 0, timeLabel: '—', phrase: p }
  }
  const sec = Math.max(0, Math.floor(atSec))
  return { atSec: sec, timeLabel: formatComplianceTimeLabel(sec), phrase: p }
}

function emptyChannel(checked: boolean): VideoChannelStatus {
  return { checked, normal: true, issues: [] }
}

/** 口播 / 字幕 / 画面 分通道检核报告 */
export function buildVideoComplianceChannelReport(input: {
  phrases: string[]
  asrText?: string
  asrSegments?: AsrTimedSegment[]
  frameSlotHits?: Array<{ slot: ComplianceSampleFrameSlot; hits: string[]; ocrText: string }>
  durationSec?: number | null
  briefText?: string
}): VideoComplianceChannelReport {
  const phrases = dedupePhrases(input.phrases)
  const asrText = String(input.asrText || '').trim()
  const frameSlots = input.frameSlotHits ?? []
  const subtitleOcr = frameSlots.some((f) => String(f.ocrText || '').trim().length >= 2)
  const videoMediaScanned =
    Boolean(input.durationSec != null && Number(input.durationSec) > 0) ||
    asrText.length >= 4 ||
    frameSlots.length > 0

  const asrChecked = videoMediaScanned || asrText.length >= 4
  const subtitleChecked = videoMediaScanned || subtitleOcr
  const visualChecked = videoMediaScanned || subtitleOcr

  const asrIssues: VideoChannelIssue[] = []
  const subtitleIssues: VideoChannelIssue[] = []
  const visualIssues: VideoChannelIssue[] = []

  for (const phrase of phrases) {
    if (asrText && phraseInText(asrText, phrase)) {
      const atSec = findAsrPhraseSec(phrase, input.asrSegments ?? [], asrText, input.durationSec)
      const issue = makeIssue(atSec, phrase)
      if (issue) asrIssues.push(issue)
    }

    for (const frame of frameSlots) {
      const ocr = String(frame.ocrText || '').trim()
      if (!ocr || !phraseInText(ocr, phrase)) continue
      const atSec = frameSlotToApproxSec(frame.slot, input.durationSec)
      subtitleIssues.push({ atSec, timeLabel: formatComplianceTimeLabel(atSec), phrase })
    }
  }

  const report: VideoComplianceChannelReport = {
    asr: { checked: asrChecked, normal: asrIssues.length === 0, issues: asrIssues.slice(0, 4) },
    subtitle: {
      checked: subtitleChecked,
      normal: subtitleIssues.length === 0,
      issues: subtitleIssues.slice(0, 4),
    },
    visual: { checked: visualChecked, normal: true, issues: visualIssues.slice(0, 4) },
  }

  if (!asrChecked && !subtitleChecked && input.briefText) {
    const briefHits = phrases.filter((p) => phraseInText(input.briefText!, p))
    if (briefHits.length) {
      report.asr.checked = false
      report.subtitle.checked = false
      report.visual.checked = false
    }
  }

  return report
}

export function buildVideoComplianceChannelSummary(
  report: VideoComplianceChannelReport,
  briefHits?: string[],
): string {
  const parts: string[] = []

  const pushChannel = (label: string, ch: VideoChannelStatus) => {
    if (!ch.checked) return
    if (ch.normal) {
      parts.push(`${label}正常`)
      return
    }
    const detail = ch.issues
      .slice(0, 2)
      .map((i) => {
        const tl = String(i.timeLabel || '').trim()
        return tl && tl !== '—' ? `${tl}「${i.phrase}」` : `「${i.phrase}」`
      })
      .join('、')
    parts.push(`${label}${detail}`)
  }

  pushChannel('口播', report.asr)
  pushChannel('字幕', report.subtitle)
  pushChannel('画面', report.visual)

  if (!parts.length && briefHits?.length) {
    return `可能违规请注意修改：商单Brief含「${briefHits.slice(0, 2).join('、')}」（成片口播/字幕/画面未检出或未上传成片）`
  }

  if (!parts.length) return ''
  return `可能违规请注意修改：${parts.join('；')}`
}

/** 扁平 locations（兼容旧字段） */
export function resolveVideoHitLocations(input: {
  phrases: string[]
  asrText?: string
  asrSegments?: AsrTimedSegment[]
  ocrText?: string
  frameSlotHits?: Array<{ slot: ComplianceSampleFrameSlot; hits: string[]; ocrText?: string }>
  briefText?: string
  durationSec?: number | null
}): VideoComplianceLocation[] {
  const report = buildVideoComplianceChannelReport({
    phrases: input.phrases,
    asrText: input.asrText,
    asrSegments: input.asrSegments,
    frameSlotHits: (input.frameSlotHits ?? []).map((f) => ({
      slot: f.slot,
      hits: f.hits,
      ocrText: f.ocrText ?? '',
    })),
    durationSec: input.durationSec,
    briefText: input.briefText,
  })

  const out: VideoComplianceLocation[] = []
  for (const i of report.asr.issues) {
    out.push({
      phrase: i.phrase,
      source: 'asr',
      atSec: i.atSec,
      timeLabel: i.timeLabel,
    })
  }
  for (const i of report.subtitle.issues) {
    out.push({
      phrase: i.phrase,
      source: 'subtitle',
      atSec: i.atSec,
      timeLabel: i.timeLabel,
    })
  }
  for (const i of report.visual.issues) {
    out.push({
      phrase: i.phrase,
      source: 'visual',
      atSec: i.atSec,
      timeLabel: i.timeLabel,
    })
  }

  const briefOnly = input.phrases.filter(
    (p) =>
      input.briefText &&
      phraseInText(input.briefText, p) &&
      !out.some((o) => o.phrase === p || o.phrase.includes(p)),
  )
  for (const p of briefOnly) {
    out.push({ phrase: p, source: 'brief' })
  }

  return out.slice(0, 12)
}

export function buildVideoComplianceLocationMessage(
  locations: VideoComplianceLocation[],
  channelReport?: VideoComplianceChannelReport,
  briefHits?: string[],
): string {
  if (channelReport) {
    const msg = buildVideoComplianceChannelSummary(channelReport, briefHits)
    if (msg) return msg
  }
  if (!locations.length) return ''
  const parts = locations.slice(0, 3).map((loc) => {
    if (loc.atSec != null && loc.timeLabel) {
      const src = loc.source === 'asr' ? '口播' : loc.source === 'subtitle' ? '字幕' : '画面'
      return `${src}${loc.timeLabel}「${loc.phrase}」`
    }
    if (loc.source === 'brief') return `Brief「${loc.phrase}」`
    return `「${loc.phrase}」`
  })
  return `可能违规请注意修改：${parts.join('、')}`
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
