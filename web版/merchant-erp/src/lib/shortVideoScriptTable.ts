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
  const base = rows.slice(0, count)
  while (base.length < count) {
    const i = base.length
    base.push({
      timeRange: `${i * segmentSec}-${(i + 1) * segmentSec}秒`,
      visual: '',
      dialogue: '',
    })
  }
  return base
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

/** 从上传文档 / AI 返回文本中尽量解析分镜表行 */
export function parseScriptRowsFromPlainText(text: string): ShortVideoScriptRow[] {
  const rows: ShortVideoScriptRow[] = []
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    const pipe = line.match(
      /^(\d+\s*[-–—~至]\s*\d+\s*秒?)\s*[|｜\t]\s*(.+?)\s*[|｜\t]\s*(.+)$/i,
    )
    if (pipe) {
      rows.push({ timeRange: pipe[1]!.trim(), visual: pipe[2]!.trim(), dialogue: pipe[3]!.trim() })
      continue
    }
    const timed = line.match(/^(\d+\s*[-–—~至]\s*\d+\s*秒?)\s+(.+?)[，,]\s*(.+)$/)
    if (timed) {
      rows.push({
        timeRange: timed[1]!.trim(),
        visual: timed[2]!.trim(),
        dialogue: timed[3]!.trim(),
      })
      continue
    }
    const labeled = line.match(
      /^(?:\d+\s*[-–—~至]\s*\d+\s*秒?)?\s*画面[:：]\s*(.+?)(?:口播|对白|字幕|文案)[:：]\s*(.+)$/i,
    )
    if (labeled) {
      const timeM = line.match(/^(\d+\s*[-–—~至]\s*\d+\s*秒?)/i)
      rows.push({
        timeRange: timeM?.[1]?.trim() ?? '',
        visual: labeled[1]!.trim(),
        dialogue: labeled[2]!.trim(),
      })
    }
  }
  return rows
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
