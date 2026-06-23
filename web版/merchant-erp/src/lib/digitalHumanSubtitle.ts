/** 数字人口播成片 — SRT 字幕生成（按口播时长均分） */
import { assForceStyleForSubtitle } from './digitalHumanPostProcessStyles.js'

export { assForceStyleForSubtitle }

export function wrapSubtitleLineForVertical(text: string, maxChars = 12): string[] {
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
    if (/[，。！？；、]/.test(ch) && buf.length >= 6) {
      out.push(buf)
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out.length ? out : [t.slice(0, maxChars)]
}

export function splitSubtitleLines(text: string): string[] {
  return text
    .split(/\n+|(?<=[。！？；])/)
    .flatMap((s) => wrapSubtitleLineForVertical(s.trim()))
    .filter(Boolean)
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
