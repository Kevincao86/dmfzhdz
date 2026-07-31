/** 数字人口播成片 — SRT 字幕生成（按口播时长均分） */
import { assForceStyleForSubtitle } from './digitalHumanPostProcessStyles.js'
import { parseScriptTimeRangeSeconds } from './shortVideoScriptTable'

export { assForceStyleForSubtitle }

/** 短片竖屏折行：约 14 字/行，优先标点处断开，减少半截句上屏 */
export const SHORT_VIDEO_SUBTITLE_MAX_CHARS = 14
/** 数字人口播竖屏折行 */
export const DH_SUBTITLE_MAX_CHARS = 14

export function wrapSubtitleLineForVertical(text: string, maxChars = 8): string[] {
  const t = text.trim()
  if (!t) return []
  if (t.length <= maxChars) return [t]
  const out: string[] = []
  let buf = ''
  for (const ch of t) {
    const next = buf + ch
    if (next.length > maxChars && buf.length >= 4) {
      out.push(buf)
      buf = ch
      continue
    }
    buf = next
    if (/[，。！？；、]/.test(ch) && buf.length >= Math.min(6, maxChars - 2)) {
      out.push(buf)
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf.trim())
  // 避免「清。」这类 1～2 字残句单独上屏：并回上一行（略超 max 可接受）
  while (out.length >= 2) {
    const last = out[out.length - 1]!
    const bare = last.replace(/[，。！？；、…\s]/g, '')
    if (bare.length >= 3) break
    const prev = out[out.length - 2]!
    out[out.length - 2] = `${prev}${last}`
    out.pop()
  }
  return out.length ? out : [t.slice(0, maxChars)]
}

export function splitSubtitleLines(text: string, maxChars = 8): string[] {
  const paras = text.replace(/\r/g, '').split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const sentences: string[] = []
  for (const para of paras) {
    const parts = para.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean)
    sentences.push(...(parts.length ? parts : [para]))
  }
  const lines = sentences.flatMap((s) => wrapSubtitleLineForVertical(s, maxChars)).filter(Boolean)
  const deduped: string[] = []
  for (const line of lines) {
    if (deduped[deduped.length - 1] !== line) deduped.push(line)
  }
  return deduped
}

function isBlankDialogue(dialogue: string): boolean {
  const t = String(dialogue || '').trim()
  if (!t) return true
  if (/^[(（]\s*无口播\s*[)）]$/.test(t)) return true
  if (/^无口播$/.test(t)) return true
  return false
}

function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, '0')
}

function pad3(n: number): string {
  return String(Math.floor(n)).padStart(3, '0')
}

export function formatSrtTimestamp(sec: number): string {
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  const ms = Math.round((s - Math.floor(s)) * 1000)
  return `${pad2(h)}:${pad2(m)}:${pad2(ss)},${pad3(ms)}`
}

/** 按字数占比分配每句字幕时长 */
export function buildSrtContent(lines: string[], totalDurationSec: number): string {
  const rows = lines.filter(Boolean)
  if (!rows.length || totalDurationSec <= 0) return ''
  const totalChars = rows.reduce((sum, line) => sum + line.length, 0) || 1
  let cursor = 0
  const blocks: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]!
    const share = line.length / totalChars
    const dur = Math.max(1.1, totalDurationSec * share)
    const start = cursor
    const end = i === rows.length - 1 ? totalDurationSec : Math.min(totalDurationSec, cursor + dur)
    cursor = end
    if (end <= start) continue
    blocks.push(
      `${i + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${line}\n`,
    )
  }
  return blocks.join('\n')
}

export type TimedSubtitleChunk = {
  text: string
  durationSec: number
}

/**
 * 按口播分段（TTS/OmniHuman 段）生成 SRT：段边界对齐音频时长，段内再按标点折行。
 */
export function buildSrtFromTimedChunks(
  chunks: TimedSubtitleChunk[] | null | undefined,
  opts?: { maxCharsPerLine?: number; totalDurationSec?: number },
): string {
  if (!chunks?.length) return ''
  const maxChars = opts?.maxCharsPerLine ?? DH_SUBTITLE_MAX_CHARS
  const totalCap =
    typeof opts?.totalDurationSec === 'number' && opts.totalDurationSec > 0
      ? opts.totalDurationSec
      : Number.POSITIVE_INFINITY

  const blocks: string[] = []
  let idx = 1
  let cursor = 0
  for (const chunk of chunks) {
    const text = String(chunk.text || '')
      .trim()
      .replace(/^\[口播段\s*\d+\]$/, '')
    if (!text || isBlankDialogue(text)) {
      cursor += Math.max(0, Number(chunk.durationSec) || 0)
      continue
    }
    const lines = splitSubtitleLines(text, maxChars)
    if (!lines.length) {
      cursor += Math.max(0, Number(chunk.durationSec) || 0)
      continue
    }
    const segDur = Math.max(0.8, Number(chunk.durationSec) || lines.length * 1.2)
    const segStart = Math.min(cursor, totalCap)
    let segEnd = Math.min(cursor + segDur, totalCap)
    if (segEnd <= segStart) {
      cursor = segEnd
      continue
    }
    const totalChars = lines.reduce((n, l) => n + l.length, 0) || 1
    let lineCursor = segStart
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const share = line.length / totalChars
      const slice = Math.max(0.7, (segEnd - segStart) * share)
      const start = lineCursor
      const end = i === lines.length - 1 ? segEnd : Math.min(segEnd, lineCursor + slice)
      lineCursor = end
      if (end <= start) continue
      blocks.push(
        `${idx}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${line}\n`,
      )
      idx += 1
    }
    cursor = segEnd
  }

  // 末段拉伸到成片总时长（避免口播结束字幕过早消失）
  if (
    Number.isFinite(totalCap) &&
    blocks.length > 0 &&
    cursor + 0.35 < totalCap
  ) {
    const last = blocks[blocks.length - 1]!
    blocks[blocks.length - 1] = last.replace(
      /(--> )(\d{2}:\d{2}:\d{2},\d{3})/,
      `$1${formatSrtTimestamp(totalCap)}`,
    )
  }

  return blocks.join('\n')
}

export type ScriptRowForSubtitle = {
  timeRange: string
  dialogue: string
}

/**
 * 按分镜 timeRange + dialogue 生成 SRT（对齐镜头时间轴）。
 * 无口播段跳过；段内多行按字数均分该段时长。
 */
export function buildSrtFromScriptRows(
  rows: ScriptRowForSubtitle[] | null | undefined,
  totalDurationSec: number,
  opts?: { maxCharsPerLine?: number },
): string {
  if (!rows?.length || totalDurationSec <= 0) return ''
  const maxChars = opts?.maxCharsPerLine ?? SHORT_VIDEO_SUBTITLE_MAX_CHARS
  const timed = rows
    .map((r) => {
      const range = parseScriptTimeRangeSeconds(r.timeRange)
      const dialogue = String(r.dialogue || '').trim()
      if (!range || isBlankDialogue(dialogue)) return null
      const start = Math.max(0, Math.min(totalDurationSec, range.start))
      const end = Math.max(start + 0.35, Math.min(totalDurationSec, range.end))
      if (end <= start) return null
      const lines = splitSubtitleLines(dialogue, maxChars)
      if (!lines.length) return null
      return { start, end, lines }
    })
    .filter((x): x is { start: number; end: number; lines: string[] } => Boolean(x))
    .sort((a, b) => a.start - b.start)

  if (!timed.length) return ''

  const blocks: string[] = []
  let idx = 1
  for (const seg of timed) {
    const segDur = seg.end - seg.start
    const totalChars = seg.lines.reduce((n, l) => n + l.length, 0) || 1
    let cursor = seg.start
    for (let i = 0; i < seg.lines.length; i++) {
      const line = seg.lines[i]!
      const share = line.length / totalChars
      const slice = Math.max(0.6, segDur * share)
      const start = cursor
      const end = i === seg.lines.length - 1 ? seg.end : Math.min(seg.end, cursor + slice)
      cursor = end
      if (end <= start) continue
      blocks.push(
        `${idx}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${line}\n`,
      )
      idx += 1
    }
  }
  return blocks.join('\n')
}

/** 读取 MP4 时长（秒），用于字幕分段 */
export function probeVideoDurationSec(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob)
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      const d = v.duration
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(d) && d > 0 ? d : 0)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    v.src = url
  })
}
