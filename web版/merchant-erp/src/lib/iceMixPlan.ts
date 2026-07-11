/**
 * AI混剪：将分镜表 + 素材池映射为 ICE 时间线段（浏览器端与服务端共用）。
 */
import {
  maxScriptTimeRangeEndSec,
  parseScriptTimeRangeSeconds,
  dialogueLinesFromGuidance,
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
  /** 源素材内截取起点（秒），混剪非从 0 秒硬切 */
  sourceInSec?: number
  /** 源素材内截取终点（秒） */
  sourceOutSec?: number
  caption?: string
}

/** 手机实拍短片默认时长（秒），用于规划截取点上限 */
export const MIX_DEFAULT_SOURCE_DURATION_SEC = 6

/** 将源片入点限制在 [0, 源时长 - 片段长] 内，避免 ICE Video.In > duration */
export function clampMixSourceInSec(
  sourceInSec: number,
  clipDurSec: number,
  sourceDurationSec?: number,
): number {
  const clipDur = Math.max(0.35, clipDurSec)
  let inSec = Math.max(0, sourceInSec)
  if (sourceDurationSec != null && sourceDurationSec > 0) {
    const maxIn = Math.max(0, sourceDurationSec - clipDur)
    inSec = Math.min(inSec, maxIn)
  }
  return inSec
}

export function resolveMixTotalDurationSec(rows: ShortVideoScriptRow[], fallbackSec: number): number {
  const maxEnd = maxScriptTimeRangeEndSec(rows)
  if (maxEnd > 0) return Math.min(120, Math.max(1, maxEnd))
  return Math.min(120, Math.max(1, fallbackSec))
}

/** 去掉签名参数，用于判断是否为同一条 OSS 素材 */
export function canonicalMixMediaKey(url: string): string {
  const raw = url.trim()
  if (!raw) return ''
  if (raw.startsWith('oss://')) return raw.split('?')[0]!
  try {
    const u = new URL(raw)
    return `${u.hostname}${u.pathname}`
  } catch {
    return raw.split('?')[0]!
  }
}

/**
 * 混剪时间轴须首尾相接、无重叠（否则 ICE 只显示第一条）。
 * AI 分镜若返回重复「0-4秒」等，在此强制按段均分 0→total。
 */
export function ensureSequentialMixScriptRows(
  rows: ShortVideoScriptRow[],
  totalSec: number,
): ShortVideoScriptRow[] {
  if (rows.length === 0) return rows
  const total = Math.min(120, Math.max(1, totalSec))
  let lastEnd = 0
  let sequential = true
  for (const row of rows) {
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    if (!tr || tr.start + 0.05 < lastEnd) {
      sequential = false
      break
    }
    lastEnd = tr.end
  }
  if (sequential && lastEnd >= total - 0.5) return rows

  const each = total / rows.length
  return rows.map((row, i) => ({
    ...row,
    timeRange: `${formatMixSec(i * each)}-${formatMixSec((i + 1) * each)}秒`,
  }))
}

function formatMixSec(n: number): string {
  const v = Math.round(n * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** 各段口播合并为 TTS 全文（混剪讲解轨） */
export function collectMixNarrationText(rows: ShortVideoScriptRow[]): string {
  return rows
    .map((r) =>
      r.dialogue
        .trim()
        .replace(/^（无口播）$/i, '')
        .replace(/^["「]|["」]$/g, ''),
    )
    .filter((t) => t.length >= 2)
    .join('。')
    .replace(/。+/g, '。')
    .trim()
}

/** 在素材池中均匀取第 i 段应对应的下标（段数少于素材数时避免总用前几条） */
export function spreadMixMaterialIndex(
  segmentIndex: number,
  segmentCount: number,
  poolLen: number,
): number {
  if (poolLen <= 0) return 0
  if (poolLen === 1) return 0
  if (segmentCount <= 1) return Math.min(segmentIndex, poolLen - 1)
  if (segmentCount >= poolLen) return segmentIndex % poolLen
  return Math.round((segmentIndex * (poolLen - 1)) / (segmentCount - 1))
}

/** 从素材池均匀抽样（用于视觉分析 / 截帧，覆盖首尾与中间） */
export function sampleMixMaterialsEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return [...items]
  if (max <= 1) return [items[0]!]
  const out: T[] = []
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (items.length - 1)) / (max - 1))
    out.push(items[idx]!)
  }
  return out
}

/** 混剪单段最短时长（秒）；为覆盖全部素材可短于 1 秒 */
export const MIX_MIN_CLIP_SEC = 0.75
/** 分镜/时间线最多段数（与 IMS 批量成片上限对齐） */
export const MIX_MAX_STORYBOARD_SEGMENTS = 48

/** 多素材混剪：段数 = 素材数，每条素材必须有一段（上限 48） */
export function resolveMixStoryboardSegmentCount(
  _targetTotalSec: number,
  _segmentSec: number,
  materialCount: number,
): number {
  if (materialCount <= 2) {
    return Math.max(2, materialCount)
  }
  return Math.min(materialCount, MIX_MAX_STORYBOARD_SEGMENTS)
}

/** 为每条素材生成一段分镜（时间均分，口播/画面从已有分镜轮询） */
export function buildAllMaterialCoverageRows(
  materials: Array<{ label: string }>,
  targetTotalSec: number,
  sourceRows: ShortVideoScriptRow[],
  guidance = '',
): ShortVideoScriptRow[] {
  const n = Math.max(2, materials.length)
  const total = Math.max(5, Math.ceil(targetTotalSec))
  const clipSec = total / n
  const dialogues = sourceRows
    .map((r) => r.dialogue.trim())
    .filter((d) => d.length >= 2 && !/^（无口播）$/i.test(d))
  const guidanceLines = dialogueLinesFromGuidance(guidance)
  const visuals = sourceRows.map((r) => r.visual.trim()).filter((v) => v.length >= 2)
  const hook = guidanceLines[0] || guidance.trim().slice(0, 48) || '精彩片段'

  const rows = Array.from({ length: n }, (_, i) => {
    const start = Math.round(i * clipSec * 10) / 10
    const end = i === n - 1 ? total : Math.round((i + 1) * clipSec * 10) / 10
    const matLabel = materials[i]?.label || `素材${i + 1}`
    return {
      timeRange: `${start}-${end}秒`,
      visual:
        visuals[i % Math.max(1, visuals.length)] ||
        `${matLabel}：展示本条实拍画面`,
      dialogue:
        dialogues[i % Math.max(1, dialogues.length)] ||
        guidanceLines[i % Math.max(1, guidanceLines.length)] ||
        hook,
    }
  })
  return ensureSequentialMixScriptRows(rows, total)
}

/** 每条素材至少出现一次的映射：段 i → 素材 i（段数须 ≥ 素材数） */
export function assignFullMaterialCoverageSlots(materialCount: number): number[] {
  return Array.from({ length: materialCount }, (_, i) => i)
}

/** 分镜段数不足时扩展为「每条素材一段」 */
export function expandMixRowsForMaterialPool(
  rows: ShortVideoScriptRow[],
  targetTotalSec: number,
  materialCount: number,
  _segmentSec: number,
  materialLabels: Array<{ label: string }> = [],
  guidance = '',
): ShortVideoScriptRow[] {
  if (materialCount <= 0) return rows
  const mats =
    materialLabels.length >= materialCount
      ? materialLabels
      : Array.from({ length: materialCount }, (_, i) => ({ label: `素材${i + 1}` }))
  return buildAllMaterialCoverageRows(mats, targetTotalSec, rows, guidance)
}

/** 混剪提交前：强制 N 段分镜 + N 条素材一一映射 */
export function syncMixCoverageForAllMaterials(
  materials: Array<{ label: string }>,
  targetTotalSec: number,
  sourceRows: ShortVideoScriptRow[],
  guidance = '',
): { rows: ShortVideoScriptRow[]; slots: number[] } {
  const rows = buildAllMaterialCoverageRows(materials, targetTotalSec, sourceRows, guidance)
  const slots = assignFullMaterialCoverageSlots(materials.length)
  return { rows, slots }
}

/** 混剪默认映射：段数 = 素材数时 0,1,…,N-1；否则均匀抽样 */
export function assignMixMaterialSlots(rowCount: number, poolLen: number): number[] {
  if (rowCount <= 0 || poolLen <= 0) return []
  if (rowCount === poolLen) return assignFullMaterialCoverageSlots(poolLen)
  return Array.from({ length: rowCount }, (_, i) => spreadMixMaterialIndex(i, rowCount, poolLen))
}

/**
 * 纠正「全部指向素材 0」：常见于先有空池再批量上传，或混剪成片误入素材池。
 * 当素材数 ≥ 2 且段数 ≥ 2 时，若映射全相同则自动轮询。
 */
export function normalizeMixMaterialSlots(
  slots: number[],
  rowCount: number,
  poolLen: number,
): number[] {
  const roundRobin = assignMixMaterialSlots(rowCount, poolLen)
  if (rowCount <= 0 || poolLen <= 0) return roundRobin
  const effective = Array.from({ length: rowCount }, (_, i) => {
    const raw = slots[i]
    const idx = raw == null ? roundRobin[i]! : Math.max(0, raw) % poolLen
    return idx
  })
  if (poolLen < 2 || rowCount < 2) return effective
  const uniq = new Set(effective)
  if (uniq.size === 1) return roundRobin
  return effective
}

/** @deprecated 轮播式映射，仅作兜底；一键混剪请用 buildIceMixSegmentsFromEditPlan */
export function buildIceMixSegmentsFromScript(
  rows: ShortVideoScriptRow[],
  _materialSlots: number[],
  materials: IceMixMaterialSlot[],
  fallbackTotalSec: number,
): IceMixSegmentPlan[] {
  if (!rows.length || !materials.length) return []
  const total = resolveMixTotalDurationSec(rows, fallbackTotalSec)
  const orderedRows = ensureSequentialMixScriptRows(rows, total)
  const slots = normalizeMixMaterialSlots(_materialSlots, orderedRows.length, materials.length)
  const segments: IceMixSegmentPlan[] = []
  let cursor = 0

  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i]!
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    let start: number
    let end: number
    if (tr) {
      start = tr.start
      end = Math.min(total, tr.end)
    } else {
      const each = total / orderedRows.length
      start = cursor
      end = Math.min(total, cursor + each)
      cursor = end
    }
    if (end <= start) continue

    const matIdx = slots[i]!
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

/** 由指导文案 + 分镜表合成 ICE editBrief（字幕、画面指令；BGM 仅写在剪辑指令段） */
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
