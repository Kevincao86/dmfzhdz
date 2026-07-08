/**
 * AI混剪：将分镜表 + 素材池映射为 ICE 时间线段（浏览器端与服务端共用）。
 */
import {
  maxScriptTimeRangeEndSec,
  parseScriptTimeRangeSeconds,
  type ShortVideoScriptRow,
} from './shortVideoScriptTable'

export type IceMixMaterialSlot = {
  kind: 'video' | 'image'
  mediaUrl: string
  signedMediaUrl?: string
  label: string
}

export type IceMixSegmentPlan = {
  kind: 'video' | 'image'
  mediaUrl: string
  signedMediaUrl?: string
  materialIndex: number
  timelineStartSec: number
  timelineEndSec: number
  caption?: string
}

export function resolveMixTotalDurationSec(rows: ShortVideoScriptRow[], fallbackSec: number): number {
  const maxEnd = maxScriptTimeRangeEndSec(rows)
  if (maxEnd > 0) return Math.min(120, Math.max(1, maxEnd))
  return Math.min(120, Math.max(1, fallbackSec))
}

/** 分镜行 → 时间线段；素材按 materialSlots 或轮询分配 */
export function buildIceMixSegmentsFromScript(
  rows: ShortVideoScriptRow[],
  materialSlots: number[],
  materials: IceMixMaterialSlot[],
  fallbackTotalSec: number,
): IceMixSegmentPlan[] {
  if (!rows.length || !materials.length) return []
  const total = resolveMixTotalDurationSec(rows, fallbackTotalSec)
  const segments: IceMixSegmentPlan[] = []
  let cursor = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    let start: number
    let end: number
    if (tr) {
      start = tr.start
      end = Math.min(total, tr.end)
    } else {
      const each = total / rows.length
      start = cursor
      end = Math.min(total, cursor + each)
      cursor = end
    }
    if (end <= start) continue

    const matIdx = Math.max(0, materialSlots[i] ?? i % materials.length) % materials.length
    const mat = materials[matIdx]
    if (!mat) continue

    segments.push({
      kind: mat.kind,
      mediaUrl: mat.mediaUrl,
      signedMediaUrl: mat.signedMediaUrl,
      materialIndex: matIdx,
      timelineStartSec: start,
      timelineEndSec: end,
      caption: row.dialogue.trim() || undefined,
    })
  }
  return segments
}

/** 将分镜口播写入 ICE brief 字幕段 */
export function composeMixEditBrief(instruction: string, rows: ShortVideoScriptRow[]): string {
  const inst = String(instruction || '').trim()
  const lines = rows
    .map((r) => r.dialogue.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('「') ? t : `「${t.replace(/^["「]|["」]$/g, '')}」`))
  const copy = lines.join('\n')
  if (inst && copy) return `【剪辑指令】\n${inst}\n\n【字幕文案】\n${copy}`
  if (copy) return `【字幕文案】\n${copy}`
  if (inst) return `【剪辑指令】\n${inst}`
  return ''
}
