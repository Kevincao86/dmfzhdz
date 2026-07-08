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

/** 目标成片时长选项（秒） */
export const MIX_TARGET_TOTAL_OPTIONS = [10, 20, 30, 45, 60] as const

/** 从剪辑指令 + 分镜「画面/指令」列推断 ICE 转场/淡入淡出（无需手选特效） */
export function inferIceEffectIdFromMixContent(
  instruction: string,
  rows: Array<{ visual: string }>,
): string {
  const blob = [instruction, ...rows.map((r) => r.visual)].join('\n')
  if (/随机转场/.test(blob)) return 'trans_random'
  if (/放大切换|放大转场|simplezoom/i.test(blob)) return 'trans_zoom'
  if (/向上擦除|上擦|wipeup/i.test(blob)) return 'trans_wipe_up'
  if (/向右擦除|擦除|wiperight/i.test(blob)) return 'trans_wipe'
  if (/方向推移|directional/i.test(blob)) return 'trans_directional'
  if (/蔓延溶解|perlin/i.test(blob)) return 'trans_perlin'
  if (/淡入淡出/.test(blob) && /叠化|溶解/.test(blob)) return 'fade_trans_fade'
  if (/叠化|溶解/.test(blob)) return 'trans_fade'
  if (/淡入淡出|柔和过渡/.test(blob)) return 'fade'
  if (/转场|切换/.test(blob)) return 'trans_fade'
  return 'trans_fade'
}

/** 由指导文案 + 分镜表合成 ICE editBrief（字幕、画面指令、全局节奏/BGM） */
export function composeMixEditBrief(instruction: string, rows: ShortVideoScriptRow[]): string {
  const inst = String(instruction || '').trim()
  const visualLines = rows.map((r) => r.visual.trim()).filter(Boolean)
  const copyLines = rows
    .map((r) => r.dialogue.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('「') ? t : `「${t.replace(/^["「]|["」]$/g, '')}」`))
  const copy = copyLines.join('\n')
  const visualBlock =
    visualLines.length > 0
      ? `【画面指令】\n${visualLines.map((v, i) => `段${i + 1}：${v}`).join('\n')}`
      : ''

  const parts: string[] = []
  if (inst) parts.push(`【剪辑指令】\n${inst}`)
  if (visualBlock) parts.push(visualBlock)
  if (copy) parts.push(`【字幕文案】\n${copy}`)
  return parts.join('\n\n')
}

/** 分镜是否具备可提交混剪的文案/指令 */
export function mixStoryboardBriefReady(
  guidance: string,
  rows: Array<{ visual: string; dialogue: string }>,
): boolean {
  if (guidance.trim().length >= 4) return true
  if (rows.some((r) => r.dialogue.trim().length >= 2)) return true
  if (rows.some((r) => r.visual.trim().length >= 4)) return true
  return false
}
