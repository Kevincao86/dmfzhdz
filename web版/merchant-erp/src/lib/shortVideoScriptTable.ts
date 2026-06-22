import { SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX } from './shortVideoNarrationExtract.js'

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
  const parts: string[] = []
  const time = row.timeRange.trim()
  const visual = row.visual.trim()
  const dialogue = row.dialogue.trim()
  if (time) parts.push(`【时段】${time}`)
  if (visual) parts.push(`【画面】${visual}`)
  if (dialogue) parts.push(`【口播】${dialogue}`)
  if (!parts.length) return ''
  const body = parts.join('\n')
  return body.includes('【画面约束】') ? body : `${body}\n${SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX}`
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

export function defaultScriptRows(count: number, segmentSec: number): ShortVideoScriptRow[] {
  return Array.from({ length: count }, (_, i) => ({
    timeRange: `${i * segmentSec}-${(i + 1) * segmentSec}秒`,
    visual: '',
    dialogue: '',
  }))
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

/** 由目标总时长与单段秒数估算段数（2～12），仅作占位/兜底；实际段数以 AI 规划为准 */
export function segmentCountFromTargetTotalSec(targetTotalSec: number, segmentSec: number): number {
  return Math.max(2, Math.min(12, Math.ceil(targetTotalSec / Math.max(5, segmentSec))))
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
  if (!vis) return `屏幕大字：${ov}`
  return `${vis}；屏幕大字：${ov}`
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

/** 合并 Markdown 表行与正文中的「0-2s」时间段，去重排序 */
export function mergeGuidanceScriptTimeTemplates(text: string): ShortVideoScriptRow[] {
  const parsed = parseScriptRowsFromPlainText(text)
  const ranges = collectExplicitTimeRangesFromText(text)
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
  for (const r of ranges) put(r)
  for (const r of parsed) put(r)
  return [...map.values()].sort(
    (a, b) =>
      (parseScriptTimeRangeSeconds(a.timeRange)?.start ?? 0) -
      (parseScriptTimeRangeSeconds(b.timeRange)?.start ?? 0),
  )
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
  const target =
    targetTotalSec >= 10 ? targetTotalSec : inferTargetTotalSecFromText(text) || targetTotalSec

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

  while (out.length < count) {
    const i = out.length
    const prevEnd =
      i > 0
        ? parseScriptTimeRangeSeconds(out[i - 1]!.timeRange)?.end ?? i * segmentSec
        : 0
    const remain = count - i
    const end =
      i === count - 1 && target >= 10
        ? Math.max(prevEnd + 2, target)
        : prevEnd + Math.max(2, Math.ceil(Math.max(target - prevEnd, segmentSec) / remain))
    out.push({
      timeRange: `${prevEnd}-${end}秒`,
      visual: rows[i]?.visual ?? '',
      dialogue: rows[i]?.dialogue ?? '',
    })
  }

  return out.slice(0, count).map((r, i) => ({
    ...r,
    timeRange: r.timeRange.trim()
      ? normalizeScriptTimeRange(r.timeRange)
      : `${i * segmentSec}-${(i + 1) * segmentSec}秒`,
  }))
}
