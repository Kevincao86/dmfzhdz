/**
 * AI混剪：将分镜表 + 素材池映射为 ICE 时间线段（浏览器端与服务端共用）。
 */
import {
  maxScriptTimeRangeEndSec,
  parseScriptTimeRangeSeconds,
  dialogueLinesFromGuidance,
  segmentCountFromTargetTotalSec,
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

/** 混剪 AI 规划失败时：从指导文案机械拆 6～12 段代表性分镜 */
export function buildMixPlannerFallbackRows(
  guidance: string,
  targetTotalSec: number,
): ShortVideoScriptRow[] {
  const total = Math.min(120, Math.max(5, Math.ceil(targetTotalSec)))
  const lines = dialogueLinesFromGuidance(guidance)
  const segmentCount = Math.min(
    12,
    Math.max(6, lines.length >= 6 ? Math.min(lines.length, 12) : Math.ceil(total / 3)),
  )
  const each = total / segmentCount
  const hook = lines[0] || guidance.trim().slice(0, 48) || '精彩片段'

  const rows = Array.from({ length: segmentCount }, (_, i) => {
    const start = Math.round(i * each * 10) / 10
    const end = i === segmentCount - 1 ? total : Math.round((i + 1) * each * 10) / 10
    const line = lines[i % Math.max(1, lines.length)] || hook
    return {
      timeRange: `${start}-${end}秒`,
      visual: line.length >= 8 ? line.slice(0, 72) : `镜头${i + 1}：展示实拍画面`,
      dialogue: line.slice(0, 120),
    }
  })
  return ensureSequentialMixScriptRows(rows, total)
}

/** 按目标时长 + 叙事逻辑生成 K 段分镜（K=时长/每段秒数，从素材池语义挑选，非每条素材一段） */
export function buildNarrativeMatchedMixCoverage(
  materials: Array<{ label: string }>,
  targetTotalSec: number,
  sourceRows: ShortVideoScriptRow[] = [],
  guidance = '',
  segmentSec = 5,
  profiles: MixNarrativeProfileInput[] = [],
): { rows: ShortVideoScriptRow[]; slots: number[] } {
  const targetCount = mixTargetSegmentCount(targetTotalSec, segmentSec)
  const n = Math.max(2, Math.min(targetCount, materials.length))
  const profileList: MixNarrativeProfileInput[] =
    profiles.length >= materials.length
      ? profiles
      : materials.map((m, i) => ({
          index: i,
          label: m.label,
          description: m.label,
        }))
  const pattern = inferMixNarrativePattern(guidance, profileList)
  const slots = pickMaterialsForNarrativeSlots(n, materials, profileList, guidance)
  const total = Math.max(5, Math.ceil(targetTotalSec))
  const each = total / n
  const guidanceLines = dialogueLinesFromGuidance(guidance)
  const hook = guidanceLines[0] || guidance.trim().slice(0, 48) || '精彩片段'
  const dialogues = sourceRows
    .map((r) => r.dialogue.trim())
    .filter((d) => d.length >= 2 && !/^（无口播）$/i.test(d))
  const visuals = sourceRows.map((r) => r.visual.trim()).filter((v) => v.length >= 2)

  const rows = Array.from({ length: n }, (_, i) => {
    const start = Math.round(i * each * 10) / 10
    const end = i === n - 1 ? total : Math.round((i + 1) * each * 10) / 10
    const mi = slots[i]!
    const matLabel = materials[mi]?.label || `素材${mi + 1}`
    const prof = profileList[mi]!
    const slotRole = segmentRoleForIndex(i, n, pattern)

    let visual =
      visuals[i % Math.max(1, visuals.length)] ||
      (slotRole === 'storefront' ? `门店门头/环境：${matLabel}` : `${matLabel}：展示实拍画面`)
    if (slotRole === 'storefront') {
      const storefrontVisual = visuals.find((v) => STOREFRONT_RE.test(v))
      if (storefrontVisual) visual = storefrontVisual
      else if (prof.description.trim().length >= 8) {
        visual = `门店门头/环境：${prof.description.slice(0, 72)}`
      }
    }

    let dialogue = ''
    if (slotRole === 'closing') {
      dialogue =
        guidanceLines.find((l) => CLOSING_RE.test(l)) ||
        guidanceLines[guidanceLines.length - 1] ||
        dialogues[dialogues.length - 1] ||
        `${hook}，欢迎到店体验！`
    } else if (slotRole === 'storefront') {
      dialogue =
        guidanceLines.find((l) => STOREFRONT_RE.test(l)) ||
        guidanceLines[0] ||
        dialogues[0] ||
        `走进${hook}，环境氛围拉满。`
    } else if (i === 0 && pattern === 'hook_opening') {
      dialogue = dialogues[0] || guidanceLines[0] || hook
    } else {
      const mid = guidanceLines.slice(1, Math.max(1, guidanceLines.length - 1))
      dialogue =
        dialogues[i % Math.max(1, dialogues.length)] ||
        mid[i % Math.max(1, mid.length)] ||
        guidanceLines[i % Math.max(1, guidanceLines.length)] ||
        hook
    }

    return {
      timeRange: `${start}-${end}秒`,
      visual: visual.slice(0, 120),
      dialogue: dialogue.slice(0, 120),
    }
  })

  return {
    rows: ensureSequentialMixScriptRows(rows, total),
    slots,
  }
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

/** 分镜段数不足时按目标时长扩展（素材多时语义挑选 K 段，非每条素材一段） */
export function expandMixRowsForMaterialPool(
  rows: ShortVideoScriptRow[],
  targetTotalSec: number,
  materialCount: number,
  segmentSec: number,
  materialLabels: Array<{ label: string }> = [],
  guidance = '',
  profiles: MixNarrativeProfileInput[] = [],
): ShortVideoScriptRow[] {
  if (materialCount <= 0) return rows
  const mats =
    materialLabels.length >= materialCount
      ? materialLabels
      : Array.from({ length: materialCount }, (_, i) => ({ label: `素材${i + 1}` }))
  const targetCount = mixTargetSegmentCount(targetTotalSec, segmentSec)
  if (materialCount > targetCount) {
    return buildNarrativeMatchedMixCoverage(
      mats,
      targetTotalSec,
      rows,
      guidance,
      segmentSec,
      profiles,
    ).rows
  }
  if (rows.length >= materialCount) {
    return ensureSequentialMixScriptRows(rows, Math.max(5, Math.ceil(targetTotalSec)))
  }
  return buildAllMaterialCoverageRows(mats, targetTotalSec, rows, guidance)
}

/** 混剪提交前：按目标时长生成叙事分镜 + 素材映射 */
export function syncMixCoverageForAllMaterials(
  materials: Array<{ label: string }>,
  targetTotalSec: number,
  sourceRows: ShortVideoScriptRow[],
  guidance = '',
  profiles: MixNarrativeProfileInput[] = [],
  segmentSec = 5,
): { rows: ShortVideoScriptRow[]; slots: number[] } {
  const targetCount = mixTargetSegmentCount(targetTotalSec, segmentSec)
  if (materials.length > targetCount) {
    return buildNarrativeMatchedMixCoverage(
      materials,
      targetTotalSec,
      sourceRows,
      guidance,
      segmentSec,
      profiles,
    )
  }
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

/** 分镜表每段画面与口播均已填写（无空格） */
export function mixStoryboardRowsComplete(
  rows: Array<{ visual: string; dialogue: string }>,
): boolean {
  if (rows.length < 2) return false
  return rows.every((r) => r.visual.trim().length > 0 && r.dialogue.trim().length > 0)
}

/** 分镜表未填完整时的提示文案 */
export function mixStoryboardIncompleteHint(
  rows: Array<{ visual: string; dialogue: string }>,
): string | null {
  if (rows.length < 2) return '分镜至少 2 段（点「AI 规划分镜」）'
  const gaps = rows
    .map((r, i) => {
      const missing: string[] = []
      if (!r.visual.trim()) missing.push('画面')
      if (!r.dialogue.trim()) missing.push('口播')
      return missing.length ? `第 ${i + 1} 段缺${missing.join('、')}` : null
    })
    .filter((x): x is string => Boolean(x))
  if (gaps.length === 0) return null
  const shown = gaps.slice(0, 3).join('；')
  return `分镜表须逐格填写完整${gaps.length > 3 ? `（${shown}…）` : `（${shown}）`}`
}

/** 混剪素材画面叙事角色（探店/本地生活） */
export type MixMaterialNarrativeRole =
  | 'storefront'
  | 'product'
  | 'process'
  | 'experience'
  | 'ambience'
  | 'other'

/** 成片叙事结构：门头开场 或 卖点钩子开场 */
export type MixNarrativePattern = 'store_opening' | 'hook_opening'

export type MixNarrativeProfileInput = {
  index: number
  label: string
  description: string
  frameTimeline?: Array<{ atSec: number; description: string }>
}

export type MixSegmentNarrativeSlot = MixMaterialNarrativeRole | 'closing'

const STOREFRONT_RE =
  /门头|店招|招牌|门店外观|门面|入口处|店铺外观|外景|全景.*店|招牌字|店名|导航|地址|欢迎光临|进店/
const PRODUCT_RE =
  /套餐|团购|优惠|价格|菜品|产品|成品|摆盘|特写|出货|商品|卖点|分量|食材|出锅/
const PROCESS_RE = /制作|烹饪|后厨|操作|翻炒|下锅|加工|过程|熬制|装盘/
const EXPERIENCE_RE = /试吃|品尝|顾客|体验|人物.*吃|互动|推荐/
const CLOSING_RE = /下单|团购|赶紧|快来|收藏|关注|就在|欢迎.*到店|点击|马上/

function narrativeTextBlob(
  description: string,
  label?: string,
  frameTimeline?: Array<{ atSec: number; description: string }>,
): string {
  const beats = frameTimeline?.map((b) => b.description).join(' ') ?? ''
  return `${description} ${label ?? ''} ${beats}`.toLowerCase()
}

/** 根据 AI 画面描述判断素材叙事角色 */
export function classifyMixMaterialRole(
  description: string,
  label?: string,
  frameTimeline?: Array<{ atSec: number; description: string }>,
): MixMaterialNarrativeRole {
  const t = narrativeTextBlob(description, label, frameTimeline)
  if (STOREFRONT_RE.test(t)) return 'storefront'
  if (PRODUCT_RE.test(t)) return 'product'
  if (PROCESS_RE.test(t)) return 'process'
  if (EXPERIENCE_RE.test(t)) return 'experience'
  if (/环境|氛围|内景|装修|座位|大堂/.test(t)) return 'ambience'
  return 'other'
}

/** 分镜行文案/画面推断叙事角色 */
export function classifyRowNarrativeRole(visual: string, dialogue: string): MixSegmentNarrativeSlot {
  const t = `${visual} ${dialogue}`
  if (CLOSING_RE.test(t) || /结束|收尾|行动号召/.test(t)) return 'closing'
  if (STOREFRONT_RE.test(t)) return 'storefront'
  if (PRODUCT_RE.test(t)) return 'product'
  if (PROCESS_RE.test(t)) return 'process'
  if (EXPERIENCE_RE.test(t)) return 'experience'
  return 'other'
}

/** 是否存在门头/门店类素材 */
export function hasStorefrontMixMaterials(profiles: MixNarrativeProfileInput[]): boolean {
  return profiles.some(
    (p) => classifyMixMaterialRole(p.description, p.label, p.frameTimeline) === 'storefront',
  )
}

/** 推断叙事结构：有门头素材默认门头开场，否则可用卖点钩子开场 */
export function inferMixNarrativePattern(
  guidance: string,
  profiles: MixNarrativeProfileInput[],
): MixNarrativePattern {
  const g = guidance.trim()
  if (/先卖点|先套餐|先产品|开头.*吸引|钩子|劲爆|开头.*产品/.test(g)) return 'hook_opening'
  if (/先.*门店|门头.*开场|开头.*环境|先氛围/.test(g)) return 'store_opening'
  if (hasStorefrontMixMaterials(profiles)) return 'store_opening'
  if (/门店|地址|导航|怎么找|在哪里|欢迎来|到店/.test(g)) return 'store_opening'
  return 'hook_opening'
}

/** 按段序与叙事模式分配该段期望画面角色 */
export function segmentRoleForIndex(
  segmentIndex: number,
  segmentCount: number,
  pattern: MixNarrativePattern,
): MixSegmentNarrativeSlot {
  if (segmentCount <= 1) return 'product'
  const isFirst = segmentIndex === 0
  const isLast = segmentIndex === segmentCount - 1
  const isSecondLast = segmentIndex === segmentCount - 2

  if (isLast) return 'closing'

  if (pattern === 'store_opening') {
    if (isFirst) return 'storefront'
    if (isSecondLast && segmentCount >= 4) return 'product'
    if (isSecondLast) return 'experience'
    return segmentIndex <= 1 ? 'product' : 'process'
  }

  // hook_opening：产品钩子 → 中段 → 门头指引 → 结束语
  if (isFirst) return 'product'
  if (isSecondLast) return 'storefront'
  return 'product'
}

/** 素材角色与分镜槽位匹配得分 */
export function scoreMaterialRoleForSegment(
  materialRole: MixMaterialNarrativeRole,
  slotRole: MixSegmentNarrativeSlot,
): number {
  if (slotRole === 'closing') {
    if (materialRole === 'experience') return 10
    if (materialRole === 'product') return 8
    if (materialRole === 'storefront') return 5
    return 3
  }
  if (materialRole === slotRole) return 14
  const adj: Partial<Record<MixMaterialNarrativeRole, Partial<Record<MixSegmentNarrativeSlot, number>>>> = {
    storefront: { product: 3, ambience: 6, experience: 2 },
    product: { process: 8, experience: 6, storefront: 2, ambience: 4 },
    process: { product: 8, experience: 5 },
    experience: { product: 6, storefront: 4 },
    ambience: { storefront: 7, product: 4 },
    other: { product: 4, process: 3 },
  }
  return adj[materialRole]?.[slotRole] ?? 1
}

/** 按叙事顺序为 K 段分镜挑选素材（每条素材最多用一次） */
export function pickMaterialsForNarrativeSlots(
  targetSegmentCount: number,
  materials: Array<{ label: string }>,
  profiles: MixNarrativeProfileInput[],
  guidance: string,
): number[] {
  const n = Math.max(2, Math.min(targetSegmentCount, materials.length))
  const pattern = inferMixNarrativePattern(guidance, profiles)
  const used = new Set<number>()
  const picks: number[] = []

  for (let seg = 0; seg < n; seg++) {
    const slotRole = segmentRoleForIndex(seg, n, pattern)
    let bestIdx = -1
    let bestScore = -1

    for (let mi = 0; mi < materials.length; mi++) {
      if (used.has(mi)) continue
      const prof = profiles[mi] ?? {
        index: mi,
        label: materials[mi]!.label,
        description: materials[mi]!.label,
      }
      const matRole = classifyMixMaterialRole(prof.description, prof.label, prof.frameTimeline)
      let score = scoreMaterialRoleForSegment(matRole, slotRole)
      if (prof.description.trim().length >= 24) score += 2
      if (score > bestScore) {
        bestScore = score
        bestIdx = mi
      }
    }

    if (bestIdx < 0) {
      bestIdx = spreadMixMaterialIndex(seg, n, materials.length)
      let guard = 0
      while (used.has(bestIdx) && guard++ < materials.length) {
        bestIdx = (bestIdx + 1) % materials.length
      }
    }
    used.add(bestIdx)
    picks.push(bestIdx)
  }
  return picks
}

/** 目标时长对应的分镜段数（默认每段 5 秒） */
export function mixTargetSegmentCount(targetTotalSec: number, segmentSec = 5): number {
  return segmentCountFromTargetTotalSec(targetTotalSec, segmentSec)
}
