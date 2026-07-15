import {
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  sanitizePromptForVideoModel,
} from './shortVideoNarrationExtract.js'

/** 提交视频模型：只执行【画面】，口播/大字由后期合成 */
export const SHORT_VIDEO_STRICT_VISUAL_SUFFIX =
  '【执行要求】严格按【画面】描述生成镜头与运镜，不得偏离场景/主体；禁止在画面内渲染任何文字、字幕、标题、Logo 字样；口播与大字由后期合成。'

export type ShortVideoScriptRow = {
  timeRange: string
  visual: string
  dialogue: string
}

export type ShortVideoScriptSegmentPayload = {
  timeRange?: string
  visual?: string
  dialogue?: string
  prompt?: string
  action?: string
}

export function buildVideoPromptFromScriptRow(row: ShortVideoScriptRow): string {
  const time = row.timeRange.trim()
  const visual = stripOnScreenTextFromVisual(row.visual.trim())
  if (!visual && !time) return ''
  const parts: string[] = []
  if (time) parts.push(`【时段】${time}`)
  if (visual) parts.push(`【画面】${visual}`)
  const body = `${parts.join('\n')}\n${SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX}\n${SHORT_VIDEO_STRICT_VISUAL_SUFFIX}`
  return sanitizePromptForVideoModel(body)
}

export function buildPlanFromScriptRows(
  rows: ShortVideoScriptRow[],
  targetN: number,
): { prompts: string[]; narrationScript: string } | null {
  if (rows.length < 2) return null
  const sliced: ShortVideoScriptRow[] = rows.slice(0, targetN)
  while (sliced.length < targetN && sliced.length > 0) {
    sliced.push({ ...sliced[sliced.length - 1]! })
  }
  const prompts = sliced.map(buildVideoPromptFromScriptRow).filter((p) => p.length > 0)
  if (prompts.length < 2) return null
  const narrationScript = sliced
    .map((r) => r.dialogue.trim())
    .filter(Boolean)
    .join('。')
    .replace(/。+/g, '。')
  return { prompts, narrationScript }
}

export const SCRIPT_ROW_MAX_COUNT = 12

export function defaultScriptRows(count: number, segmentSec: number): ShortVideoScriptRow[] {
  return Array.from({ length: count }, (_, i) => ({
    timeRange: `${i * segmentSec}-${(i + 1) * segmentSec}秒`,
    visual: '',
    dialogue: '',
  }))
}

/** 手动追加一段空分镜；时间段承接上一段结束秒数 */
export function appendEmptyScriptRow(
  rows: ShortVideoScriptRow[],
  segmentSec: number,
): ShortVideoScriptRow[] {
  if (rows.length >= SCRIPT_ROW_MAX_COUNT) return rows
  const seg = Math.min(15, Math.max(2, Math.round(segmentSec) || 5))
  let start = maxScriptTimeRangeEndSec(rows)
  if (start <= 0 && rows.length > 0) start = rows.length * seg
  return [
    ...rows,
    {
      timeRange: `${start}-${start + seg}秒`,
      visual: '',
      dialogue: '',
    },
  ]
}

/** 删除指定分镜行；至少保留 2 段 */
export function removeScriptRowAt(
  rows: ShortVideoScriptRow[],
  index: number,
): ShortVideoScriptRow[] {
  if (rows.length <= 2) return rows
  if (!Number.isFinite(index) || index < 0 || index >= rows.length) return rows
  return rows.filter((_, i) => i !== index)
}

export function resizeScriptRows(
  rows: ShortVideoScriptRow[],
  count: number,
  segmentSec: number,
): ShortVideoScriptRow[] {
  const effectiveCount = Math.min(12, Math.max(2, count))
  const base = rows.slice(0, effectiveCount)
  while (base.length < effectiveCount) {
    const i = base.length
    base.push({
      timeRange: `${i * segmentSec}-${(i + 1) * segmentSec}秒`,
      visual: '',
      dialogue: '',
    })
  }
  return base.map((r, i) => ({
    ...r,
    timeRange: r.timeRange.trim()
      ? normalizeScriptTimeRange(r.timeRange)
      : `${i * segmentSec}-${(i + 1) * segmentSec}秒`,
  }))
}

export function scriptRowsToOverallPrompt(rows: ShortVideoScriptRow[]): string {
  return rows
    .map((r, i) => {
      const time = r.timeRange.trim() || `第${i + 1}段`
      const vis = r.visual.trim() || '（待填画面）'
      const dia = r.dialogue.trim() || '（待填口播）'
      return `【${time}】画面：${vis}；口播：${dia}`
    })
    .join('\n')
}

export function isScriptRowsUsable(rows: ShortVideoScriptRow[]): boolean {
  if (rows.length < 2) return false
  return rows.every((r) => r.visual.trim().length >= 3 || r.dialogue.trim().length >= 3)
}

const SCRIPT_TIME_RANGE_RE = /(\d+)\s*[-–—~至]\s*(\d+)\s*(?:s(?:ec)?|秒)?/i

export function parseScriptTimeRangeSeconds(
  timeRange: string,
): { start: number; end: number } | null {
  const m = SCRIPT_TIME_RANGE_RE.exec(String(timeRange || '').trim())
  if (!m) return null
  const start = Number(m[1])
  const end = Number(m[2])
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return { start, end }
}

export function normalizeScriptTimeRange(raw: string): string {
  const parsed = parseScriptTimeRangeSeconds(raw)
  if (!parsed) return String(raw || '').trim()
  return `${parsed.start}-${parsed.end}秒`
}

export function scriptRowsHaveExplicitTimeRanges(rows: ShortVideoScriptRow[]): boolean {
  if (rows.length < 2) return false
  const timed = rows.filter((r) => parseScriptTimeRangeSeconds(r.timeRange) != null)
  return timed.length >= 2
}

/** 从指导文案中统计独立时间段数量（用于自动决定分镜段数） */
export function maxScriptTimeRangeEndSec(rows: ShortVideoScriptRow[]): number {
  let max = 0
  for (const r of rows) {
    const p = parseScriptTimeRangeSeconds(r.timeRange)
    if (p) max = Math.max(max, p.end)
  }
  return max
}

/** 从正文提取所有「起-止秒」片段（含 0–2s / 0-2秒，不要求每段带「秒」字） */
export function collectExplicitTimeRangesFromText(text: string): ShortVideoScriptRow[] {
  const map = new Map<string, ShortVideoScriptRow>()
  const re = /\b(\d{1,2})\s*[-–—~至]\s*(\d{1,2})\s*(?:s(?:ec)?|秒)?\b/gi
  for (const m of String(text || '').matchAll(re)) {
    const start = Number(m[1])
    const end = Number(m[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > 120) continue
    const timeRange = normalizeScriptTimeRange(`${start}-${end}秒`)
    if (!parseScriptTimeRangeSeconds(timeRange)) continue
    map.set(timeRange, { timeRange, visual: '', dialogue: '' })
  }
  return [...map.values()].sort(
    (a, b) =>
      (parseScriptTimeRangeSeconds(a.timeRange)?.start ?? 0) -
      (parseScriptTimeRangeSeconds(b.timeRange)?.start ?? 0),
  )
}

/** 从标题/表格/说明中推断目标成片总时长（秒） */
export function inferTargetTotalSecFromText(text: string): number {
  const src = String(text || '')
  const patterns = [
    /(?:总时长|目标(?:成片)?时长|成片时长|时长|严格)\s*[:：|｜]?\s*(\d+)\s*(?:s(?:ec)?|秒)/i,
    /(\d+)\s*(?:s(?:ec)?|秒)\s*(?:推广|视频|短片|执行|分镜)/i,
    /【\s*(\d+)\s*(?:s(?:ec)?|秒)/i,
  ]
  for (const re of patterns) {
    const m = src.match(re)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n >= 5) return Math.min(60, n)
    }
  }
  const ranges = collectExplicitTimeRangesFromText(src)
  const maxEnd = maxScriptTimeRangeEndSec(ranges)
  if (maxEnd >= 10) return maxEnd
  return 0
}

export type LongformPlannerResolve = {
  segmentCount: number
  autoSegmentCount: boolean
  hasFullEmbeddedTimes: boolean
  effectiveTargetSec: number
  embeddedTimeRanges: ShortVideoScriptRow[]
}

/**
 * 长片分镜策划：有完整分镜表则按表；否则在 UI/文案指定总时长时交给 AI 自动规划 2～12 段并覆盖全片。
 * 避免「文案里仅出现 0-2s、5-8s 两段示例」时被误判为只需 2 段、总时长仅 8 秒。
 */
export function resolveLongformPlannerParams(
  text: string,
  targetTotalSec: number,
  segmentSec: number,
  embeddedRows: ShortVideoScriptRow[],
): LongformPlannerResolve {
  const effectiveTargetSec =
    targetTotalSec >= 10 ? targetTotalSec : inferTargetTotalSecFromText(text) || targetTotalSec

  const hasEmbeddedTimes =
    embeddedRows.length >= 2 && scriptRowsHaveExplicitTimeRanges(embeddedRows)
  const embeddedEnd = hasEmbeddedTimes ? maxScriptTimeRangeEndSec(embeddedRows) : 0
  const fullEmbedded =
    hasEmbeddedTimes &&
    isScriptRowsUsable(embeddedRows) &&
    (effectiveTargetSec < 10 || embeddedEnd >= effectiveTargetSec - 1)

  if (fullEmbedded) {
    return {
      segmentCount: embeddedRows.length,
      autoSegmentCount: false,
      hasFullEmbeddedTimes: true,
      effectiveTargetSec,
      embeddedTimeRanges: embeddedRows,
    }
  }

  const textRanges = collectExplicitTimeRangesFromText(text)

  if (effectiveTargetSec >= 10) {
    const minSegments = segmentCountFromTargetTotalSec(effectiveTargetSec, 5)
    return {
      segmentCount: minSegments,
      autoSegmentCount: true,
      hasFullEmbeddedTimes: false,
      effectiveTargetSec,
      embeddedTimeRanges: hasEmbeddedTimes ? embeddedRows : textRanges,
    }
  }

  const inferred = inferScriptSegmentCountFromText(text)
  const fallback = segmentCountFromTargetTotalSec(Math.max(targetTotalSec, 30), segmentSec)
  return {
    segmentCount: inferred >= 2 ? inferred : fallback,
    autoSegmentCount: false,
    hasFullEmbeddedTimes: false,
    effectiveTargetSec,
    embeddedTimeRanges: textRanges,
  }
}

export function inferScriptSegmentCountFromText(text: string): number {
  const target = inferTargetTotalSecFromText(text)
  const parsed = parseScriptRowsFromPlainText(text)
  if (parsed.length >= 2) {
    const end = maxScriptTimeRangeEndSec(parsed)
    if (target >= 10 && end >= target - 1) return Math.min(12, parsed.length)
    if (target >= 10 && end < target - 2) {
      return Math.min(12, Math.max(parsed.length, segmentCountFromTargetTotalSec(target, 5)))
    }
    return Math.min(12, parsed.length)
  }

  const ranges = collectExplicitTimeRangesFromText(text)
  if (ranges.length >= 2) {
    const end = maxScriptTimeRangeEndSec(ranges)
    if (target >= 10 && end < target - 2) {
      return Math.min(12, segmentCountFromTargetTotalSec(target, 5))
    }
    return Math.min(12, ranges.length)
  }

  const seen = new Set<string>()
  for (const m of String(text || '').matchAll(/\d+\s*[-–—~至]\s*\d+\s*(?:s(?:ec)?|秒)/gi)) {
    const normalized = normalizeScriptTimeRange(m[0]!)
    if (parseScriptTimeRangeSeconds(normalized)) seen.add(normalized)
  }
  if (seen.size >= 2) return Math.min(12, seen.size)

  if (target >= 10) {
    return Math.min(12, Math.max(2, Math.ceil(target / 5)))
  }
  return 0
}

/** 即梦 / Seedance 长视频默认单段上限（秒） */
export const LONGFORM_SEGMENT_UNIT_SEC = 15

/** 由目标总时长按 15 秒为单位切分（如 60=15×4）；实际段数以 AI 规划为准 */
export function planLongformSegmentDurations(targetTotalSec: number): number[] {
  const target = Math.max(5, Math.round(targetTotalSec))
  const unit = LONGFORM_SEGMENT_UNIT_SEC
  if (target <= unit) return [target]
  const full = Math.floor(target / unit)
  const rem = target % unit
  const plan: number[] = Array.from({ length: full }, () => unit)
  if (rem > 0) plan.push(rem)
  return plan.length ? plan : [unit]
}

/** 10 秒模型不可用时：全程 5 秒分段（如 15 秒 → 5+5+5） */
export function planLongformAllFiveSecondDurations(targetTotalSec: number): number[] {
  const target = Math.max(10, Math.round(targetTotalSec))
  const n = Math.max(2, Math.min(12, Math.ceil(target / 5)))
  return Array.from({ length: n }, () => 5)
}

export function formatLongformDurationPlanLabel(plan: number[]): string {
  if (!plan.length) return '5 秒'
  if (plan.length === 1) return `${plan[0]} 秒`
  return `${plan.join('+')} 秒（${plan.length} 段）`
}

/** 第 i 段生成秒数；超出计划段数时按剩余时长补 5/15 秒 */
export function pickLongformSegmentDurationSec(
  plan: number[],
  index: number,
  targetTotalSec: number,
  estimatedTotalSec: number,
): number {
  if (index >= 0 && index < plan.length) return plan[index]!
  const remaining = Math.max(0, targetTotalSec - estimatedTotalSec)
  if (remaining <= 5) return 5
  return LONGFORM_SEGMENT_UNIT_SEC
}

export function scriptTimeRangesFromDurationPlan(plan: number[]): string[] {
  let t = 0
  return plan.map((d) => {
    const start = t
    t += d
    return `${start}-${t}秒`
  })
}

export function resizeScriptRowsForDurationPlan(
  rows: ShortVideoScriptRow[],
  plan: number[],
): ShortVideoScriptRow[] {
  const ranges = scriptTimeRangesFromDurationPlan(plan)
  const effectiveCount = Math.min(12, Math.max(1, plan.length))
  const base = rows.slice(0, effectiveCount)
  while (base.length < effectiveCount) {
    base.push({ timeRange: ranges[base.length] ?? '', visual: '', dialogue: '' })
  }
  return base.slice(0, effectiveCount).map((r, i) => ({
    ...r,
    timeRange: r.timeRange.trim() ? normalizeScriptTimeRange(r.timeRange) : (ranges[i] ?? ''),
  }))
}

export function segmentCountFromTargetTotalSec(targetTotalSec: number, segmentSec: number): number {
  if (targetTotalSec >= LONGFORM_SEGMENT_UNIT_SEC && segmentSec >= LONGFORM_SEGMENT_UNIT_SEC) {
    return planLongformSegmentDurations(targetTotalSec).length
  }
  if (targetTotalSec >= 10 && segmentSec >= 10) {
    return planLongformSegmentDurations(targetTotalSec).length
  }
  if (targetTotalSec >= 10 && segmentSec <= 5) {
    return planLongformAllFiveSecondDurations(targetTotalSec).length
  }
  return Math.max(2, Math.min(12, Math.ceil(targetTotalSec / Math.max(5, segmentSec))))
}

/** 长视频合成：按目标总时长计算至少应生成的段数（10 秒模型按 10+5 组合；5 秒模型按 5 秒切分） */
export function minSegmentCountForTargetDuration(
  targetTotalSec: number,
  segmentSec: number,
): number {
  if (targetTotalSec < 10) return 2
  if (segmentSec >= 10) return planLongformSegmentDurations(targetTotalSec).length
  return planLongformAllFiveSecondDurations(targetTotalSec).length
}

/** AI 策划段数不足时补齐，避免 15 秒目标只生成 2 段约 9 秒成片 */
export function ensureVideoPromptsForTargetDuration(
  prompts: string[],
  targetTotalSec: number,
  segmentSec: number,
): string[] {
  if (targetTotalSec < 10 || prompts.length === 0) return prompts
  const minCount = minSegmentCountForTargetDuration(targetTotalSec, segmentSec)
  let out = [...prompts]
  while (out.length < minCount) {
    const prev = out[out.length - 1]!
    out.push(
      `${prev}\n【衔接】第 ${out.length + 1}/${minCount} 段，承接上一段尾帧连续运镜，补全至目标 ${targetTotalSec} 秒。`,
    )
  }
  let end = maxEndFromVideoPrompts(out)
  while (end < targetTotalSec - 1 && out.length < 12) {
    const prev = out[out.length - 1]!
    out.push(
      `${prev}\n【衔接】时间段 ${end}-${targetTotalSec} 秒，承接上一段尾帧，补全至目标 ${targetTotalSec} 秒成片。`,
    )
    end = targetTotalSec
  }
  return out
}

/** 分镜行数不足时扩展至目标时长所需段数 */
export function ensureScriptRowsForTargetDuration(
  rows: ShortVideoScriptRow[],
  targetTotalSec: number,
  segmentSec: number,
): ShortVideoScriptRow[] {
  if (targetTotalSec < 10 || rows.length === 0) return rows
  const minCount = minSegmentCountForTargetDuration(targetTotalSec, segmentSec)
  if (rows.length >= minCount) return rows
  return resizeScriptRows(rows, minCount, segmentSec).map((r, i) => {
    const prev = rows[Math.min(i, rows.length - 1)]!
    return {
      timeRange: r.timeRange,
      visual: r.visual.trim() || prev.visual.trim() || '延续上一镜头，平滑运镜过渡',
      dialogue: r.dialogue.trim() || prev.dialogue.trim(),
    }
  })
}

/** 解析结果的有效段数：有自定义时间段时不得少于已解析行数 */
export function effectiveScriptRowCount(
  rows: ShortVideoScriptRow[],
  requestedCount: number,
): number {
  const base = Math.min(12, Math.max(2, requestedCount))
  if (!scriptRowsHaveExplicitTimeRanges(rows)) return base
  return Math.min(12, Math.max(base, rows.length))
}

/** 用指导文案里已写好的时间段覆盖 AI 等分结果 */
export function mergeScriptRowTimeRanges(
  rows: ShortVideoScriptRow[],
  timeTemplate: ShortVideoScriptRow[],
): ShortVideoScriptRow[] {
  return rows.map((r, i) => ({
    ...r,
    timeRange: timeTemplate[i]?.timeRange.trim()
      ? normalizeScriptTimeRange(timeTemplate[i]!.timeRange)
      : r.timeRange,
  }))
}

function stripMarkdownTableCell(raw: string): string {
  return String(raw || '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .trim()
}

function splitMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((c) => stripMarkdownTableCell(c))
}

function isMarkdownTableSeparator(parts: string[]): boolean {
  return parts.length >= 2 && parts.every((p) => /^:?-{2,}:?$/.test(p.replace(/\s/g, '')))
}

function findScriptTableColumnIndex(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!.toLowerCase()
    if (patterns.some((re) => re.test(h))) return i
  }
  return -1
}

function isScriptTableTimeCell(raw: string): boolean {
  return parseScriptTimeRangeSeconds(raw) != null
}

function appendScriptOverlayText(visual: string, overlay: string): string {
  const vis = visual.trim()
  const ov = overlay.trim()
  if (!ov || ov === '—' || ov === '-' || /^无旁白$/i.test(ov) || /^[（(]无旁白[)）]$/i.test(ov))
    return vis
  /** 屏幕大字仅用于后期字幕，勿写入视频模型 prompt（否则会画进画面且易溢出） */
  return vis
}

/** 去掉已写入画面的「屏幕大字」等提示，避免模型渲染乱码字幕 */
export function stripOnScreenTextFromVisual(visual: string): string {
  return visual
    .replace(/[；;]\s*屏幕大字[:：][^；;]*/gi, '')
    .replace(/^屏幕大字[:：][^；;]*/gi, '')
    .replace(/屏幕字幕[:：][^；;]*/gi, '')
    .trim()
}

/** 由分镜 timeRange 推算本段秒数（2～15） */
export function scriptRowDurationSec(row: ShortVideoScriptRow, fallbackSec = 5): number {
  const range = parseScriptTimeRangeSeconds(row.timeRange)
  if (!range) return fallbackSec
  const d = Math.round(range.end - range.start)
  if (d >= 2 && d <= 15) return d
  return fallbackSec
}

/** 分镜表末段未到目标总时长时补一段收尾（如 11→15 秒） */
export function extendScriptRowsToTargetTotal(
  rows: ShortVideoScriptRow[],
  targetTotalSec: number,
): ShortVideoScriptRow[] {
  if (targetTotalSec < 10 || rows.length === 0) return rows
  const sorted = [...rows].sort(
    (a, b) =>
      (parseScriptTimeRangeSeconds(a.timeRange)?.start ?? 0) -
      (parseScriptTimeRangeSeconds(b.timeRange)?.start ?? 0),
  )
  const end = maxScriptTimeRangeEndSec(sorted)
  if (end >= targetTotalSec - 1) return sorted
  const last = sorted[sorted.length - 1]!
  const start = Math.max(0, end)
  return [
    ...sorted,
    {
      timeRange: `${start}-${targetTotalSec}秒`,
      visual:
        stripOnScreenTextFromVisual(last.visual) ||
        '延续上一镜头同一产品与场景，品牌定帧平稳收尾',
      dialogue: last.dialogue.trim(),
    },
  ]
}

/** 从已组装的视频 prompt 解析【时段】秒数 */
export function videoPromptDurationSec(prompt: string, fallbackSec = 5): number {
  const m = prompt.match(/【时段】([^\n]+)/)
  if (!m?.[1]) return fallbackSec
  const range = parseScriptTimeRangeSeconds(m[1].trim())
  if (!range) return fallbackSec
  const d = Math.round(range.end - range.start)
  if (d >= 2 && d <= 15) return d
  return fallbackSec
}

function maxEndFromVideoPrompts(prompts: string[]): number {
  let max = 0
  for (const p of prompts) {
    const m = p.match(/【时段】([^\n]+)/)
    if (!m?.[1]) continue
    const range = parseScriptTimeRangeSeconds(m[1].trim())
    if (range) max = Math.max(max, range.end)
  }
  return max
}

function normalizeDialogueCell(raw: string): string {
  const t = raw.trim()
  if (!t || t === '—' || t === '-' || /^无旁白$/i.test(t) || /^[（(]无旁白[)）]$/i.test(t)) return ''
  return t
}

function parseStoryboardRowParts(parts: string[], col: {
  timeIdx: number
  visualIdx: number
  dialogueIdx: number
  overlayIdx: number
}): ShortVideoScriptRow | null {
  const timeRaw = parts[col.timeIdx] ?? parts[0] ?? ''
  if (!isScriptTableTimeCell(timeRaw)) return null
  const visual = parts[col.visualIdx] ?? ''
  const dialogue = col.dialogueIdx >= 0 ? normalizeDialogueCell(parts[col.dialogueIdx] ?? '') : ''
  const overlay = col.overlayIdx >= 0 ? (parts[col.overlayIdx] ?? '') : ''
  return {
    timeRange: normalizeScriptTimeRange(timeRaw),
    visual: appendScriptOverlayText(visual, overlay),
    dialogue,
  }
}

function splitDelimitedRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
    return splitMarkdownTableRow(trimmed)
  }
  if (trimmed.includes('\t')) {
    return trimmed.split('\t').map((c) => stripMarkdownTableCell(c))
  }
  if (/[|｜]/.test(trimmed)) {
    return trimmed.split(/[|｜]/).map((c) => stripMarkdownTableCell(c)).filter(Boolean)
  }
  return null
}

function parseScriptRowsFromDelimitedTable(text: string): ShortVideoScriptRow[] {
  const lines = String(text || '').split(/\r?\n/)
  let best: ShortVideoScriptRow[] = []

  for (let i = 0; i < lines.length; i++) {
    const headerParts = splitDelimitedRow(lines[i]!)
    if (!headerParts || headerParts.length < 3) continue

    const timeIdx = findScriptTableColumnIndex(headerParts, [/时间/, /秒数/, /时段/])
    const visualIdx = findScriptTableColumnIndex(headerParts, [/画面/, /镜头/, /场景/])
    const dialogueIdx = findScriptTableColumnIndex(headerParts, [/旁白/, /口播/, /对白/, /文案/])
    const overlayIdx = findScriptTableColumnIndex(headerParts, [/屏幕大字/, /字幕/, /大字/])
    if (timeIdx < 0 || visualIdx < 0) continue

    const col = { timeIdx, visualIdx, dialogueIdx, overlayIdx }
    let cursor = i + 1
    if (cursor < lines.length) {
      const sepParts = splitDelimitedRow(lines[cursor]!)
      if (sepParts && isMarkdownTableSeparator(sepParts)) cursor += 1
    }

    const tableRows: ShortVideoScriptRow[] = []
    while (cursor < lines.length) {
      const parts = splitDelimitedRow(lines[cursor]!)
      if (!parts || parts.length < 2) break
      if (isMarkdownTableSeparator(parts)) {
        cursor += 1
        continue
      }
      const row = parseStoryboardRowParts(parts, col)
      if (!row) {
        cursor += 1
        continue
      }
      tableRows.push(row)
      cursor += 1
    }

    if (tableRows.length > best.length) best = tableRows
    if (tableRows.length >= 2) i = cursor - 1
  }

  return best
}

/** 无表头：连续「时间段 | 画面 | 旁白」行 */
function parseScriptRowsFromHeaderlessDelimitedLines(text: string): ShortVideoScriptRow[] {
  const rows: ShortVideoScriptRow[] = []
  const lines = String(text || '').split(/\r?\n/)

  for (const line of lines) {
    const parts = splitDelimitedRow(line)
    if (!parts || parts.length < 3) continue
    if (isMarkdownTableSeparator(parts)) continue
    const row = parseStoryboardRowParts(parts, {
      timeIdx: 0,
      visualIdx: 1,
      dialogueIdx: 2,
      overlayIdx: parts.length >= 4 ? 3 : -1,
    })
    if (row) rows.push(row)
  }

  return rows
}

function parseScriptRowsFromPlainLines(text: string): ShortVideoScriptRow[] {
  const rows: ShortVideoScriptRow[] = []
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    const pipe = line.match(
      /^(\d+\s*[-–—~至]\s*\d+\s*(?:s(?:ec)?|秒)?)\s*[|｜\t]\s*(.+?)\s*[|｜\t]\s*(.+)$/i,
    )
    if (pipe) {
      rows.push({
        timeRange: normalizeScriptTimeRange(pipe[1]!.trim()),
        visual: pipe[2]!.trim(),
        dialogue: pipe[3]!.trim(),
      })
      continue
    }
    const timed = line.match(/^(\d+\s*[-–—~至]\s*\d+\s*s?(?:ec)?)\s+(.+?)[，,]\s*(.+)$/i)
    if (timed) {
      rows.push({
        timeRange: normalizeScriptTimeRange(timed[1]!.trim()),
        visual: timed[2]!.trim(),
        dialogue: timed[3]!.trim(),
      })
      continue
    }
    const labeled = line.match(
      /^(?:\d+\s*[-–—~至]\s*\d+\s*s?)?\s*画面[:：]\s*(.+?)(?:口播|对白|字幕|文案)[:：]\s*(.+)$/i,
    )
    if (labeled) {
      const timeM = line.match(/^(\d+\s*[-–—~至]\s*\d+\s*s?)/i)
      rows.push({
        timeRange: timeM?.[1] ? normalizeScriptTimeRange(timeM[1]) : '',
        visual: labeled[1]!.trim(),
        dialogue: labeled[2]!.trim(),
      })
    }
  }
  return rows
}

/** 从上传文档 / AI 返回文本中尽量解析分镜表行（含 Markdown / Tab 表格） */
export function parseScriptRowsFromPlainText(text: string): ShortVideoScriptRow[] {
  const sources = [
    parseScriptRowsFromDelimitedTable(text),
    parseScriptRowsFromHeaderlessDelimitedLines(text),
    parseScriptRowsFromPlainLines(text),
  ]
  let best: ShortVideoScriptRow[] = []
  for (const rows of sources) {
    if (rows.length > best.length) best = rows
  }
  return best
}

/** 将长片策划 API 返回的 segments 转为表格行 */
export function scriptRowsFromLongformSegments(
  segments: unknown[],
  segmentSec: number,
): ShortVideoScriptRow[] {
  const rows: ShortVideoScriptRow[] = []
  for (let i = 0; i < segments.length; i++) {
    const row = segments[i]
    if (!row || typeof row !== 'object') continue
    const o = row as ShortVideoScriptSegmentPayload & Record<string, unknown>
    const timeRange =
      String(o.timeRange ?? '').trim() || `${i * segmentSec}-${(i + 1) * segmentSec}秒`
    const prompt = String(o.prompt ?? o.visual ?? o.scene ?? '').trim()
    const action = String(o.action ?? '').trim()
    const visual = [prompt, action].filter(Boolean).join('；')
    const dialogue = String(o.dialogue ?? o.narration ?? o.voiceover ?? '').trim()
    rows.push({ timeRange, visual, dialogue })
  }
  return rows
}

/** 仅有 prompts 数组时反解为表格行（规则兜底或旧响应） */
export function scriptRowsFromVideoPrompts(
  prompts: string[],
  segmentSec: number,
): ShortVideoScriptRow[] {
  return prompts.map((p, i) => {
    const timeRange = `${i * segmentSec}-${(i + 1) * segmentSec}秒`
    let body = String(p || '')
      .replace(SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX, '')
      .replace(/【画面约束】[^\n]*/g, '')
      .trim()
    const timeM = body.match(/【时段】([^\n]+)/)
    const visM = body.match(/【画面】([^\n]+)/)
    const actM = body.match(/【动作运镜】([^\n]+)/)
    const diaM = body.match(/【口播】([^\n]+)/)
    if (timeM) body = body.replace(/【时段】[^\n]+\n?/, '').trim()
    body = body
      .replace(/【画面】[^\n]+\n?/, '')
      .replace(/【动作运镜】[^\n]+\n?/, '')
      .replace(/【口播】[^\n]+\n?/, '')
      .trim()
    const visual =
      [visM?.[1]?.trim(), actM?.[1]?.trim()].filter(Boolean).join('；') ||
      body.slice(0, 500)
    return {
      timeRange: timeM?.[1]?.trim() || timeRange,
      visual,
      dialogue: diaM?.[1]?.trim() || '',
    }
  })
}

export function scriptSegmentsFromPayload(raw: unknown): ShortVideoScriptRow[] | null {
  if (!Array.isArray(raw)) return null
  const rows: ShortVideoScriptRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as ShortVideoScriptSegmentPayload
    rows.push({
      timeRange: String(o.timeRange ?? '').trim(),
      visual: String(o.visual ?? o.prompt ?? o.action ?? '').trim(),
      dialogue: String(o.dialogue ?? '').trim(),
    })
  }
  return rows.length >= 2 ? rows : null
}

/** 合并 Markdown 表行与正文中的「0-2s」时间段，去重排序（有分镜表时仅用表内时间段，避免误扫正文「2-5秒」等描述） */
export function mergeGuidanceScriptTimeTemplates(text: string): ShortVideoScriptRow[] {
  const parsed = parseScriptRowsFromPlainText(text)
  const hasTableTimes =
    parsed.length >= 2 && scriptRowsHaveExplicitTimeRanges(parsed)
  const sources = hasTableTimes ? parsed : [...collectExplicitTimeRangesFromText(text), ...parsed]
  const map = new Map<string, ShortVideoScriptRow>()
  const put = (r: ShortVideoScriptRow) => {
    const key = normalizeScriptTimeRange(r.timeRange)
    if (!parseScriptTimeRangeSeconds(key)) return
    const prev = map.get(key)
    if (!prev || r.visual.trim() || r.dialogue.trim()) {
      map.set(key, {
        timeRange: key,
        visual: r.visual.trim() || prev?.visual || '',
        dialogue: r.dialogue.trim() || prev?.dialogue || '',
      })
    }
  }
  for (const r of sources) put(r)
  return [...map.values()].sort(
    (a, b) =>
      (parseScriptTimeRangeSeconds(a.timeRange)?.start ?? 0) -
      (parseScriptTimeRangeSeconds(b.timeRange)?.start ?? 0),
  )
}

const MIX_DIALOGUE_META_PREFIX_RE =
  /^(?:商业创意(?:方向)?|核心卖点|目标受众(?:与使用场景)?|镜头(?:与场景描述)?|叙事节奏(?:与情绪)?|使用场景|场景描述|本段(?:画面)?)[：:，,\s]*/i

/** 去掉指导文案结构标签，得到可朗读口播句 */
export function sanitizeMixDialogueText(raw: string): string {
  let s = String(raw ?? '').trim()
  if (!s) return ''

  s = s.replace(MIX_DIALOGUE_META_PREFIX_RE, '')
  s = s.replace(/^\d+[.、．)\]]\s*/, '')
  s = s.replace(/核心卖点[：:]\s*/gi, '')
  s = s.replace(/叙事节奏(?:与情绪)?[：:]\s*/gi, '')

  const rhythm = s.match(/^叙事节奏由(.+?)过渡到(.+?)/)
  if (rhythm) {
    s = `从${rhythm[1]}到${rhythm[2]}，全程实拍看得见。`
  }

  return s.trim().replace(/\s{2,}/g, ' ').slice(0, 120)
}

/** 从指导文案取首句可朗读口播（禁止回退为摘要/提示语） */
export function pickMixDialogueHook(guidance: string, fallback = '探店实拍，值得期待'): string {
  const lines = dialogueLinesFromGuidance(guidance).filter((l) => !isMixDialogueMetaInstruction(l))
  return lines[0] || fallback
}

/** 是否为编导备注/结构标签/项目说明，不宜作为 TTS 口播 */
export function isMixDialogueMetaInstruction(text: string): boolean {
  const raw = String(text ?? '').trim()
  if (raw.length < 4) return true

  // 占位符（AI 未填口播）
  if (/^[\*＊\s]+$/.test(raw)) return true

  if (/^(?:商业创意|核心卖点|目标受众|镜头与|叙事节奏|本段|成片|须逐|规划要求|指导文案|项目说明|视频主题)/.test(raw)) {
    return true
  }
  if (/^叙事节奏由.+过渡到/.test(raw)) return true
  if (/^核心卖点[：:]/.test(raw)) return true

  // 编导分镜/剪辑指令（「开篇以门头…引入」类，非口述稿）
  if (/^开篇以/.test(raw)) return true
  if (/^(?:开场|片头|片尾|开头|收尾|中段|结尾)/.test(raw) && /引入|展示|突出|强调|切入|并通过/.test(raw)) {
    return true
  }
  if (/以.{2,28}引入/.test(raw)) return true
  if (/并通过(?:门店|位置|画面|镜头|招牌|环境|导航)/.test(raw)) return true
  if (
    /(?:引入|切入|引出|开篇|开场).*(?:门头|招牌|特色|卖点|套餐|门店)/.test(raw) &&
    !/[我你您咱来走进认准必须]/.test(raw)
  ) {
    return true
  }
  if (/^(?:镜头|画面|本段|此段|该段)(?:展示|呈现|突出|强调|说明)/.test(raw)) return true
  if (/须(?:与|和).*(?:画面|视觉|镜头).*(?:匹配|对应|一致)/.test(raw)) return true

  // 收尾/转化编导指令（「最后以用餐全景收尾，结合口播强调…引导用户」类）
  if (/^最后以/.test(raw) && /收尾|结合|引导|强调|口播/.test(raw)) return true
  if (/以.{2,20}收尾/.test(raw) && /结合|引导|强调|口播|下单/.test(raw)) return true
  if (/结合口播/.test(raw)) return true
  if (/口播强调/.test(raw)) return true
  if (/引导用户/.test(raw)) return true
  if (/并引导/.test(raw) && /下单|体验|到店|团购/.test(raw)) return true
  if (/^他们(?:注重|关注|追求|强调)/.test(raw)) return true
  if (/目标受众|使用场景|商业创意方向/.test(raw) && !/[我你您来这]/.test(raw)) return true
  if (/用餐全景/.test(raw) && /最后以|结合|引导|收尾/.test(raw)) return true
  if (/现点现做/.test(raw) && /最后以|结合口播|引导用户|收尾/.test(raw)) return true

  // 指导文案正文句式（非口播，勿进 TTS）
  if (/背景简洁明亮|强化食物吸引力|叙事节奏由.+转向|情绪从期待/.test(raw)) return true
  if (/门头信息可作为片尾|配合口播引导用户|线上下单/.test(raw) && !/[我你您来走认准]/.test(raw)) {
    return true
  }
  if (/适合后续 AI|须与画面一一对应|与推广\/产品\/门店毫无关联/.test(raw)) return true
  if (/环境、产品\/服务、人物动作|光线氛围/.test(raw) && raw.length > 24 && !/[我你您]/.test(raw)) {
    return true
  }

  // 指导文案整段摘要（「这是一支以…为主题的短视频…」类提示语）
  if (/这是一支以.+为主题的短视频/.test(raw)) return true
  if (/本(支|条|个)?短视频/.test(raw) && /主题|重点展示|目标受众|旨在|目的在于|为核心/.test(raw)) {
    return true
  }
  if (/以.+为核心/.test(raw) && /(?:短视频|带货|转化|引流)/.test(raw) && !/[我你您]/.test(raw)) {
    return true
  }
  if (/重点展示.+与.+/.test(raw) && /吸引|目标受众|种草|探店|卖相|门店/.test(raw)) return true
  if (/吸引目标受众/.test(raw)) return true
  if (/主题为[「"“]/.test(raw)) return true
  if (/(?:本片|该条|这支).*(?:旨在|目的在于|用于|展示)/.test(raw)) return true
  if (/短视频[，,].{4,}(?:重点|展示|吸引)/.test(raw)) return true
  if (/前往门店体验/.test(raw) && !/[我你您来走认准进]/.test(raw)) return true
  if (
    /[「"'『][^」"'』]{2,16}[」"'』]的(?:特色|卖点|亮点|优势)/.test(raw) &&
    !/[我你您来这]/.test(raw) &&
    /(?:引入|开篇|开场|并通过|展示|突出|旨在|说明)/.test(raw)
  ) {
    return true
  }
  if (
    raw.length > 28 &&
    /(?:短视频|主题|目标受众|重点展示|卖点|种草|探店|门店体验|制作过程|诱人卖相)/.test(raw) &&
    !/[我你您咱来走进认准今天这家必须安利]/.test(raw)
  ) {
    return true
  }

  const s = sanitizeMixDialogueText(raw)
  if (s.length < 4) return true
  if (isMixDialogueMetaInstructionInner(s, raw)) return true
  return false
}

/** sanitize 后再判一次，避免前缀剥离后仍漏网 */
function isMixDialogueMetaInstructionInner(cleaned: string, rawOriginal: string): boolean {
  if (cleaned === rawOriginal) return false
  if (/^开篇以/.test(cleaned)) return true
  if (/以.{2,28}引入/.test(cleaned)) return true
  if (/并通过(?:门店|位置|画面|镜头|招牌)/.test(cleaned)) return true
  if (/^最后以/.test(cleaned) && /收尾|结合|引导/.test(cleaned)) return true
  if (/结合口播|引导用户|口播强调/.test(cleaned)) return true
  return false
}

function truncateMixSpeakableText(text: string, maxChars: number): string {
  const t = text.trim()
  if (t.length <= maxChars) return t
  const cut = t.slice(0, maxChars)
  const lastPunc = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('，'), cut.lastIndexOf('！'))
  if (lastPunc >= Math.floor(maxChars * 0.5)) return cut.slice(0, lastPunc + 1)
  return `${cut}…`
}

/** 从分镜口播列构建可 TTS 全文：剔除提示语、去重，禁止掺入指导文案 */
export function buildMixSpeakableNarration(
  dialogues: string[],
  opts?: { targetSec?: number },
): string {
  const targetSec = opts?.targetSec
  const targetChars = targetSec ? Math.floor(targetSec * 4) : 480
  const minChars = targetSec ? Math.max(28, Math.floor(targetSec * 3.6)) : 0

  const unique: string[] = []
  for (const raw of dialogues) {
    const cleaned = sanitizeMixDialogueText(String(raw ?? '').trim())
    if (cleaned.length < 4) continue
    if (isMixDialogueMetaInstruction(cleaned) || isMixDialogueMetaInstruction(raw)) continue
    if (!unique.some((u) => u === cleaned || u.includes(cleaned) || cleaned.includes(u))) {
      unique.push(cleaned)
    }
  }

  if (unique.length === 0) return '探店实拍，品质在线，欢迎到店体验！'

  let narration = unique.join('。').replace(/。+/g, '。').replace(/，+/g, '，').trim()

  if (minChars > 0 && narration.length < minChars && unique.length >= 1) {
    let guard = 0
    while (narration.length < minChars && guard < unique.length * 2) {
      const extra = unique[guard % unique.length]!
      guard += 1
      if (!narration.includes(extra)) narration = `${narration}，${extra}`
      else break
    }
  }

  return truncateMixSpeakableText(narration, targetChars)
}

function pushUniqueDialogueLine(out: string[], line: string): void {
  if (isMixDialogueMetaInstruction(line)) return
  const s = sanitizeMixDialogueText(line)
  if (s.length < 4 || isMixDialogueMetaInstruction(s)) return
  if (!out.includes(s)) out.push(s)
}

/** 从指导文案拆句，供混剪补全空白口播（过滤结构标签，只保留可朗读句） */
export function dialogueLinesFromGuidance(guidance: string): string[] {
  const t = guidance.trim()
  if (!t) return []

  const out: string[] = []

  const sellingBlock = t.match(
    /核心卖点[：:]\s*([\s\S]*?)(?=(?:目标受众|镜头(?:与场景)?|叙事节奏|$))/i,
  )
  if (sellingBlock?.[1]) {
    for (const part of sellingBlock[1].split(/(?=\d+[.、．)\]]\s*)/)) {
      pushUniqueDialogueLine(out, part)
    }
  }

  for (const part of t.split(/[\n；;]|(?<=[。！？!?])\s*/)) {
    for (const sub of part.split(/(?=\d+[.、．)\]]\s*)/)) {
      pushUniqueDialogueLine(out, sub)
    }
  }

  if (out.length >= 1) return out
  return []
}

/** 根据画面描述生成兜底口播（禁止回退为指导文案摘要） */
function fallbackSpeakableDialogueFromVisual(visual: string): string {
  let v = String(visual ?? '').trim()
  v = v.replace(/^门店门头\/环境[：:]\s*/, '')
  v = v.replace(/^画面展示[了]?\s*/, '')
  v = v.replace(/\*+/g, '')
  if (/门头|招牌|店招|门店外观|门面/.test(v)) {
    const shop =
      v.match(/[「"'『]([^」"'』]{2,12})[」"'』]/)?.[1] ||
      v.match(/招牌[「"'『]?([^」"'』，,。]{2,10})/)?.[1]
    if (shop) return `认准${shop}这门头，导航直达，欢迎进店！`
    return '认准门店门头，导航直达，欢迎进店体验！'
  }
  if (/制作|烹饪|后厨|操作|淋酱|现做/.test(v)) return '后厨现做，新鲜靠谱看得见。'
  if (/成品|摆盘|套餐|菜品|牛排|出货/.test(v)) return '这一口鲜嫩多汁，太满足了！'
  const core = v.slice(0, 32).trim()
  if (core.length >= 6) return `${core}，实拍细节很抓人。`
  return '这一幕实拍很带感，继续往下看。'
}

/** 分镜表口播列统一清洗：剔除提示语/编导说明，只保留可朗读口播稿 */
export function purifyMixScriptRowsDialogue(rows: ShortVideoScriptRow[]): ShortVideoScriptRow[] {
  return rows.map((r) => {
    const raw = String(r.dialogue ?? '').trim()
    const cleaned = sanitizeMixDialogueText(raw)
    const ok =
      cleaned.length >= 4 &&
      !isMixDialogueMetaInstruction(cleaned) &&
      !isMixDialogueMetaInstruction(raw)
    return {
      ...r,
      dialogue: ok ? cleaned.slice(0, 120) : fallbackSpeakableDialogueFromVisual(r.visual),
    }
  })
}

/** @deprecated 使用 purifyMixScriptRowsDialogue */
export function sanitizeMixScriptRowsDialogue(rows: ShortVideoScriptRow[]): ShortVideoScriptRow[] {
  return purifyMixScriptRowsDialogue(rows)
}

/** AI 规划后补全空白画面/口播（混剪场景：后续会按素材数扩展） */
export function fillBlankScriptRowsFromGuidance(
  rows: ShortVideoScriptRow[],
  guidance: string,
): ShortVideoScriptRow[] {
  const lines = dialogueLinesFromGuidance(guidance).filter((l) => !isMixDialogueMetaInstruction(l))
  const hook = pickMixDialogueHook(guidance, '实拍很精彩，继续往下看')
  const visHint = '展示实拍画面'
  return rows.map((r, i) => {
    const existing = sanitizeMixDialogueText(r.dialogue)
    const existingOk =
      existing.length >= 3 &&
      !isMixDialogueMetaInstruction(existing) &&
      !isMixDialogueMetaInstruction(r.dialogue)
    const candidate = existingOk
      ? existing
      : (lines[i % Math.max(1, lines.length)] || hook).slice(0, 120)
    const filled =
      candidate.length >= 4 && !isMixDialogueMetaInstruction(candidate)
        ? candidate
        : fallbackSpeakableDialogueFromVisual(r.visual)
    return {
      ...r,
      visual: r.visual.trim().length >= 3 ? r.visual : `${visHint}（段${i + 1}）`,
      dialogue: sanitizeMixDialogueText(filled),
    }
  })
}

/** 每段画面与口播均须非空 */
export function scriptRowsFullyFilled(rows: ShortVideoScriptRow[]): boolean {
  if (rows.length < 2) return false
  return rows.every(
    (r) => r.visual.trim().length >= 3 && r.dialogue.trim().length >= 3,
  )
}

/** 校验分镜表是否填满且时间轴覆盖目标时长 */
export function validateStoryboardRows(
  rows: ShortVideoScriptRow[],
  targetTotalSec: number,
): { ok: boolean; issues: string[] } {
  const issues: string[] = []
  if (rows.length < 2) issues.push('分镜少于 2 段')
  const sorted = [...rows].sort(
    (a, b) =>
      (parseScriptTimeRangeSeconds(a.timeRange)?.start ?? 0) -
      (parseScriptTimeRangeSeconds(b.timeRange)?.start ?? 0),
  )
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!
    if (!parseScriptTimeRangeSeconds(r.timeRange)) {
      issues.push(`第 ${i + 1} 段时间段格式无效（${r.timeRange || '空'}）`)
    }
    if (r.visual.trim().length < 3) issues.push(`第 ${i + 1} 段画面为空`)
    if (r.dialogue.trim().length < 3) issues.push(`第 ${i + 1} 段口播为空`)
  }
  if (targetTotalSec >= 10) {
    const end = maxScriptTimeRangeEndSec(sorted)
    if (end < targetTotalSec - 1) {
      issues.push(`时间轴末段仅到 ${end} 秒，未覆盖目标 ${targetTotalSec} 秒`)
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseScriptTimeRangeSeconds(sorted[i - 1]!.timeRange)
    const cur = parseScriptTimeRangeSeconds(sorted[i]!.timeRange)
    if (prev && cur && cur.start < prev.end - 1) {
      issues.push(`时间段 ${sorted[i]!.timeRange} 与 ${sorted[i - 1]!.timeRange} 重叠或乱序`)
    }
  }
  return { ok: issues.length === 0, issues }
}

/** AI 规划完成后整理分镜行：按时间排序去重，不插入空白占位行 */
export function finalizePlannedScriptRows(
  aiRows: ShortVideoScriptRow[],
  guidanceText: string,
  targetTotalSec: number,
): ShortVideoScriptRow[] {
  const tableRows = parseScriptRowsFromPlainText(guidanceText).filter(
    (r) => parseScriptTimeRangeSeconds(r.timeRange) != null,
  )
  const hasTable =
    tableRows.length >= 2 && scriptRowsHaveExplicitTimeRanges(tableRows)
  const tableUsable = hasTable && isScriptRowsUsable(tableRows)

  const byTime = new Map<string, ShortVideoScriptRow>()
  for (const r of [...tableRows, ...aiRows]) {
    const key = normalizeScriptTimeRange(r.timeRange)
    if (!parseScriptTimeRangeSeconds(key)) continue
    const prev = byTime.get(key)
    byTime.set(key, {
      timeRange: key,
      visual: r.visual.trim() || prev?.visual || '',
      dialogue: r.dialogue.trim() || prev?.dialogue || '',
    })
  }

  if (tableUsable) {
    return tableRows.map((tpl) => {
      const key = normalizeScriptTimeRange(tpl.timeRange)
      return byTime.get(key) ?? tpl
    })
  }

  const target =
    targetTotalSec >= 10 ? targetTotalSec : inferTargetTotalSecFromText(guidanceText) || targetTotalSec
  const sorted = [...byTime.values()].sort(
    (a, b) =>
      (parseScriptTimeRangeSeconds(a.timeRange)?.start ?? 0) -
      (parseScriptTimeRangeSeconds(b.timeRange)?.start ?? 0),
  )
  if (target >= 10 && maxScriptTimeRangeEndSec(sorted) >= target - 1) {
    return sorted
  }
  return sorted.length >= 2 ? sorted : aiRows
}

/** 指导文案应生成的分镜行数（表内段数 + 正文时间段 + 目标总时长） */
export function resolveGuidanceScriptRowCount(
  text: string,
  targetTotalSec: number,
  segmentSec: number,
): number {
  const templates = mergeGuidanceScriptTimeTemplates(text)
  const target =
    targetTotalSec >= 10 ? targetTotalSec : inferTargetTotalSecFromText(text) || targetTotalSec
  const maxEnd = maxScriptTimeRangeEndSec(templates)

  if (templates.length >= 2 && target >= 10 && maxEnd >= target - 1) {
    return Math.min(12, templates.length)
  }
  if (templates.length >= 2 && target >= 10 && maxEnd < target - 2) {
    return Math.min(
      12,
      Math.max(templates.length, segmentCountFromTargetTotalSec(target, 5)),
    )
  }
  const inferred = inferScriptSegmentCountFromText(text)
  if (inferred >= 2) return Math.min(12, inferred)
  if (templates.length >= 2) return Math.min(12, templates.length)
  return Math.min(12, Math.max(2, segmentCountFromTargetTotalSec(target, segmentSec)))
}

/**
 * 将 AI/解析结果扩展至指导文案应有的段数；文案中有 N 个时间段则至少 N 行。
 */
export function expandScriptRowsFromGuidance(
  rows: ShortVideoScriptRow[],
  text: string,
  targetTotalSec: number,
  segmentSec: number,
): ShortVideoScriptRow[] {
  const count = resolveGuidanceScriptRowCount(text, targetTotalSec, segmentSec)
  const templates = mergeGuidanceScriptTimeTemplates(text)

  const contentByTime = new Map<string, ShortVideoScriptRow>()
  for (const r of [...templates, ...rows]) {
    const key = normalizeScriptTimeRange(r.timeRange)
    if (!parseScriptTimeRangeSeconds(key)) continue
    const prev = contentByTime.get(key)
    contentByTime.set(key, {
      timeRange: key,
      visual: r.visual.trim() || prev?.visual || '',
      dialogue: r.dialogue.trim() || prev?.dialogue || '',
    })
  }

  const out: ShortVideoScriptRow[] = []
  const usedTimes = new Set<string>()

  if (templates.length >= 2) {
    for (const tpl of templates) {
      if (out.length >= count) break
      const key = normalizeScriptTimeRange(tpl.timeRange)
      usedTimes.add(key)
      out.push(
        contentByTime.get(key) ?? {
          timeRange: key,
          visual: tpl.visual,
          dialogue: tpl.dialogue,
        },
      )
    }
  }

  for (const r of rows) {
    if (out.length >= count) break
    const key = normalizeScriptTimeRange(r.timeRange)
    if (key && parseScriptTimeRangeSeconds(key)) {
      if (usedTimes.has(key)) continue
      usedTimes.add(key)
      out.push(contentByTime.get(key) ?? { ...r, timeRange: key })
      continue
    }
    if (!r.visual.trim() && !r.dialogue.trim()) continue
    out.push(r)
  }

  const mapped = out.slice(0, count).map((r, i) => ({
    ...r,
    timeRange: r.timeRange.trim()
      ? normalizeScriptTimeRange(r.timeRange)
      : `${i * segmentSec}-${(i + 1) * segmentSec}秒`,
  }))
  return extendScriptRowsToTargetTotal(mapped, targetTotalSec)
}
