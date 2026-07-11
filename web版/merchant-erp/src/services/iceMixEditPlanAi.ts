/**
 * AI 混剪剪辑规划：ICE Timeline 拼接 + 视觉模型（qwen-vl / doubao-vl）匹配素材。
 * 不再使用纯文本 LLM 猜 materialIndex（易全选第一条）。
 */
import { postAiChat } from './ai/aiClient'
import { collectMixMaterialFramesForEditPlan } from './iceMixMaterialFrames'
import {
  spreadMixMaterialIndex,
  type IceMixMaterialSlot,
} from '../lib/iceMixPlan'
import {
  clampMixSourceInSec,
  ensureSequentialMixScriptRows,
  MIX_DEFAULT_SOURCE_DURATION_SEC,
  resolveMixTotalDurationSec,
  type IceMixSegmentPlan,
} from '../lib/iceMixPlan'
import {
  parseScriptTimeRangeSeconds,
  type ShortVideoScriptRow,
} from '../lib/shortVideoScriptTable'

export type IceMixMaterialProfile = {
  index: number
  label: string
  kind: 'video' | 'image'
  description: string
  /** 估算源片时长（秒），用于规划截取点 */
  estimatedDurationSec?: number
}

export type MixEditSegmentDecision = {
  segmentIndex: number
  materialIndex: number
  /** 从源素材该秒数起剪（混剪截取，非时间轴位置） */
  sourceInSec: number
  clipNote?: string
}

const VISION_EDIT_PLAN_TIMEOUT_MS = 22_000

const VISION_EDIT_PLAN_SYSTEM = `你是专业短视频混剪剪辑师（探店/餐饮/街头小吃/本地生活带货）。用户会提供【指导文案】【分镜表】以及每条素材的采样截图（附图）。
须为每一段分镜输出剪辑决策：
1. materialIndex：选用哪条素材（从 0 开始），必须按画面语义匹配分镜「画面」描述；禁止全部段都用 materialIndex=0
2. sourceInSec：从该素材第几秒起截取（视频 0–8s；图片固定 0）；同素材复用时 sourceInSec 至少相差 1.5 秒，避开重复镜头
3. 叙事顺序（强制）：开场氛围/门头/全景 → 制作过程/操作特写 → 成品/试吃/卖点收尾；口播与画面一一对应
4. 理解附图：识别食材、烹饪动作、成品摆盘、顾客互动，按语义分配到最匹配分镜

只输出 JSON 数组，无 markdown：
[{"segmentIndex":0,"materialIndex":2,"sourceInSec":0,"clipNote":"门店外观"},...]`

function normalizeParsedMaterialIndices(
  decisions: MixEditSegmentDecision[],
  matCount: number,
): MixEditSegmentDecision[] {
  if (matCount <= 0) return decisions
  const hasZero = decisions.some((d) => d.materialIndex === 0)
  const oneBased =
    !hasZero && decisions.every((d) => d.materialIndex >= 1 && d.materialIndex <= matCount)
  return decisions.map((d) => ({
    ...d,
    materialIndex: oneBased
      ? Math.max(0, d.materialIndex - 1)
      : Math.max(0, d.materialIndex) % matCount,
  }))
}

function parseEditPlanJson(raw: string, segCount: number, matCount: number): MixEditSegmentDecision[] | null {
  const m = raw.match(/\[[\s\S]*\]/)
  if (!m) return null
  try {
    const arr = JSON.parse(m[0]) as unknown[]
    if (!Array.isArray(arr)) return null
    const out: MixEditSegmentDecision[] = []
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const segmentIndex = Number(o.segmentIndex)
      const materialIndex = Number(o.materialIndex)
      const sourceInSec = Math.max(0, Number(o.sourceInSec) || 0)
      if (!Number.isFinite(segmentIndex) || segmentIndex < 0 || segmentIndex >= segCount) continue
      if (!Number.isFinite(materialIndex) || materialIndex < 0) continue
      out.push({
        segmentIndex,
        materialIndex: Math.max(0, materialIndex),
        sourceInSec,
        clipNote: typeof o.clipNote === 'string' ? o.clipNote.slice(0, 80) : undefined,
      })
    }
    if (out.length < Math.min(2, segCount)) return null
    return normalizeParsedMaterialIndices(out, matCount)
  } catch {
    return null
  }
}

/** 关键词：分镜 visual 与素材描述/文件名重合度 */
function scoreMaterialMatch(
  visual: string,
  profile: IceMixMaterialProfile,
  matLabel?: string,
): number {
  const v = visual.toLowerCase()
  const d = profile.description.toLowerCase()
  const label = (matLabel || profile.label || '').toLowerCase()
  if (!v.trim()) return 0
  let score = 0
  if (label && v.includes(label)) score += 8
  if (label && label.length >= 4 && d.includes(label)) score += 4
  if (!d.trim()) return score
  const tokens = v.split(/[\s，,、；;。.]+/).filter((t) => t.length >= 2)
  for (const t of tokens) {
    if (d.includes(t)) score += 2
    if (label.includes(t)) score += 1
  }
  if (/门店|外观|环境|门头/.test(v) && /门店|外观|环境|门头/.test(d)) score += 3
  if (/产品|成品|特写|菜品|商品/.test(v) && /产品|成品|特写|菜|商品/.test(d)) score += 3
  if (/制作|过程|后厨|操作|烹饪/.test(v) && /制作|过程|后厨|操作|烹饪/.test(d)) score += 3
  if (/顾客|体验|试吃|人物/.test(v) && /顾客|体验|试吃|人物|人/.test(d)) score += 3
  return score
}

function isEditPlanDiverseEnough(
  decisions: MixEditSegmentDecision[],
  matCount: number,
): boolean {
  if (decisions.length < 2 || matCount < 2) return true
  const mats = new Set(decisions.map((d) => d.materialIndex))
  const ins = decisions.map((d) => Math.round(d.sourceInSec * 10) / 10)
  const distinctIns = new Set(ins)
  if (mats.size >= 2) return true
  if (distinctIns.size >= 2 && ins.some((x) => x > 0.05)) return true
  return false
}

function inferSourceInSec(visual: string, estDur: number): number {
  const dur = Math.max(2, Math.min(estDur || MIX_DEFAULT_SOURCE_DURATION_SEC, 12))
  if (/成品|特写|结尾|收尾|logo|招牌菜/.test(visual)) {
    return clampMixSourceInSec(Math.min(dur * 0.35, Math.max(0, dur - 2)), 1, dur)
  }
  if (/过程|制作|烹饪|操作|后厨|加工|搅拌/.test(visual)) {
    return clampMixSourceInSec(Math.min(dur * 0.15, Math.max(0, dur - 1.5)), 1, dur)
  }
  if (/顾客|体验|试吃|互动/.test(visual)) {
    return clampMixSourceInSec(Math.min(dur * 0.25, Math.max(0, dur - 1.5)), 1, dur)
  }
  return 0
}

function profileAt(
  profiles: IceMixMaterialProfile[],
  materials: IceMixMaterialSlot[],
  mi: number,
): IceMixMaterialProfile {
  return (
    profiles.find((p) => p.index === mi) ?? {
      index: mi,
      label: materials[mi]!.label,
      kind: materials[mi]!.kind,
      description: materials[mi]!.label,
      estimatedDurationSec:
        materials[mi]!.kind === 'video' ? MIX_DEFAULT_SOURCE_DURATION_SEC : undefined,
    }
  )
}

/** 结构化分配：轮询素材 + 语义微调 + 错开截取点，保证多素材分散 */
export function buildStructuralMixDecisions(
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[],
): MixEditSegmentDecision[] {
  const usedIn = new Map<number, number>()
  return rows.map((row, segmentIndex) => {
    const cycleIdx = spreadMixMaterialIndex(segmentIndex, rows.length, materials.length)
    let bestIdx = cycleIdx
    let bestScore = -1

    const candidatePool =
      materials.length <= 16
        ? materials.map((_, mi) => mi)
        : Array.from({ length: 5 }, (_, d) => {
            const offset = d - 2
            return (cycleIdx + offset + materials.length) % materials.length
          })

    for (const mi of candidatePool) {
      const prof = profileAt(profiles, materials, mi)
      const semantic = scoreMaterialMatch(row.visual, prof, materials[mi]!.label)
      const cycleBonus = mi === cycleIdx ? 3 : 0
      const score = semantic + cycleBonus
      if (score > bestScore) {
        bestScore = score
        bestIdx = mi
      }
    }

    if (materials.length >= 2 && bestScore < 4) {
      bestIdx = cycleIdx
    }

    const est =
      profileAt(profiles, materials, bestIdx).estimatedDurationSec ??
      MIX_DEFAULT_SOURCE_DURATION_SEC
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    const clipDur = tr ? Math.max(0.35, tr.end - tr.start) : 4

    let sourceInSec = inferSourceInSec(row.visual, est)
    if (materials.length >= 2) {
      sourceInSec = clampMixSourceInSec(
        sourceInSec + (segmentIndex % 3) * 0.8,
        clipDur,
        est,
      )
    }
    const lastIn = usedIn.get(bestIdx)
    if (lastIn != null && Math.abs(sourceInSec - lastIn) < 1.2) {
      sourceInSec = clampMixSourceInSec(sourceInSec + 1.5, clipDur, est)
    }
    sourceInSec = clampMixSourceInSec(sourceInSec, clipDur, est)
    usedIn.set(bestIdx, sourceInSec)

    return { segmentIndex, materialIndex: bestIdx, sourceInSec }
  })
}

/** 禁止全段同一素材同一入点：按分镜语义重分配 */
export function enforceDiverseEditDecisions(
  decisions: MixEditSegmentDecision[],
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[],
): MixEditSegmentDecision[] {
  if (materials.length < 2 || decisions.length < 2) return decisions
  if (isEditPlanDiverseEnough(decisions, materials.length)) return decisions

  return buildStructuralMixDecisions(rows, materials, profiles).map((d, i) => {
    const prev = decisions.find((x) => x.segmentIndex === i) ?? decisions[i]
    return prev?.clipNote ? { ...d, clipNote: prev.clipNote } : d
  })
}

export function fallbackMixEditDecisions(
  rows: ShortVideoScriptRow[],
  profiles: IceMixMaterialProfile[],
  materials?: IceMixMaterialSlot[],
): MixEditSegmentDecision[] {
  if (materials && materials.length > 0) {
    return buildStructuralMixDecisions(rows, materials, profiles)
  }
  const usedIn = new Map<number, number>()
  return rows.map((row, segmentIndex) => {
    let bestIdx = segmentIndex % Math.max(1, profiles.length)
    let bestScore = -1
    for (const p of profiles) {
      const s = scoreMaterialMatch(row.visual, p, p.label)
      if (s > bestScore) {
        bestScore = s
        bestIdx = p.index
      }
    }
    if (bestScore <= 0 && profiles.length > 0) {
      bestIdx = profiles[segmentIndex % profiles.length]!.index
    }
    const est =
      profiles.find((p) => p.index === bestIdx)?.estimatedDurationSec ??
      MIX_DEFAULT_SOURCE_DURATION_SEC
    const clipEst = 4
    let sourceInSec = inferSourceInSec(row.visual, est)
    const prev = usedIn.get(bestIdx)
    if (prev != null && Math.abs(sourceInSec - prev) < 1) {
      sourceInSec = clampMixSourceInSec(sourceInSec + 1.2, clipEst, est)
    }
    sourceInSec = clampMixSourceInSec(sourceInSec, clipEst, est)
    usedIn.set(bestIdx, sourceInSec)
    return { segmentIndex, materialIndex: bestIdx, sourceInSec }
  })
}

async function tryVisionEditPlan(opts: {
  guidance: string
  rows: ShortVideoScriptRow[]
  materials: IceMixMaterialSlot[]
  profiles: IceMixMaterialProfile[]
  frames: Array<{ index: number; label: string; dataUrl: string }>
}): Promise<MixEditSegmentDecision[] | null> {
  if (opts.frames.length < 1) return null

  const profileBlock = opts.profiles
    .map(
      (p) =>
        `素材${p.index}（${p.label}）：${p.description}${p.estimatedDurationSec ? `；约${Math.round(p.estimatedDurationSec)}秒` : ''}`,
    )
    .join('\n')
  const storyboard = opts.rows
    .map((r, i) => {
      const tr = parseScriptTimeRangeSeconds(r.timeRange)
      return `段${i} ${tr ? `${tr.start}-${tr.end}s` : r.timeRange} | 画面：${r.visual || '（待填）'} | 口播：${r.dialogue || '（无）'}`
    })
    .join('\n')
  const frameLegend = opts.frames
    .map((f, i) => `附图${i + 1} = 素材${f.index}（${f.label}）`)
    .join('\n')

  const userBlock = `【指导文案】\n${opts.guidance.trim()}\n\n【素材画面库】\n${profileBlock}\n\n【分镜表】\n${storyboard}\n\n【附图对应关系】\n${frameLegend}\n\n请为段0～段${opts.rows.length - 1} 各输出一条剪辑决策 JSON。`

  const imageDataUrls = opts.frames.map((f) => f.dataUrl).slice(0, 12)
  const providers: Array<'qwen' | 'doubao'> = ['qwen', 'doubao']

  for (const provider of providers) {
    try {
      const res = await postAiChat({
        provider,
        temperature: 0.15,
        imageDataUrls,
        messages: [
          { role: 'system', content: VISION_EDIT_PLAN_SYSTEM },
          { role: 'user', content: userBlock },
        ],
      })
      const parsed = parseEditPlanJson(
        res.content?.trim() || '',
        opts.rows.length,
        opts.materials.length,
      )
      if (parsed && parsed.length >= 2) return parsed
    } catch {
      /* try next provider */
    }
  }
  return null
}

export async function planMixEditFromInstructions(opts: {
  guidance: string
  rows: ShortVideoScriptRow[]
  materials: IceMixMaterialSlot[]
  materialProfiles: IceMixMaterialProfile[]
  targetTotalSec: number
  onProgress?: (msg: string) => void
}): Promise<
  | { ok: true; decisions: MixEditSegmentDecision[] }
  | { ok: false; message: string }
> {
  const materials = opts.materials
  const profiles = opts.materialProfiles
  if (materials.length === 0) {
    return { ok: false, message: '无可用素材' }
  }
  const total = resolveMixTotalDurationSec(opts.rows, opts.targetTotalSec)
  const rows = ensureSequentialMixScriptRows(opts.rows, total)
  if (rows.length < 2) {
    return { ok: false, message: '分镜至少 2 段' }
  }

  const profileList =
    profiles.length > 0
      ? profiles
      : materials.map((m, i) => ({
          index: i,
          label: m.label,
          kind: m.kind,
          description: m.label,
          estimatedDurationSec: m.kind === 'video' ? MIX_DEFAULT_SOURCE_DURATION_SEC : undefined,
        }))

  let decisions = buildStructuralMixDecisions(rows, materials, profileList)

  opts.onProgress?.('视觉模型正在匹配素材与截取点…')
  try {
    const frames = await Promise.race([
      collectMixMaterialFramesForEditPlan(materials, {
        maxFrames: Math.min(24, Math.max(12, Math.min(materials.length, 16) * 2)),
        onProgress: opts.onProgress,
      }),
      new Promise<Array<{ index: number; label: string; dataUrl: string }>>((resolve) => {
        window.setTimeout(() => resolve([]), VISION_EDIT_PLAN_TIMEOUT_MS)
      }),
    ])

    if (frames.length >= 1) {
      const visionDecisions = await Promise.race([
        tryVisionEditPlan({
          guidance: opts.guidance,
          rows,
          materials,
          profiles: profileList,
          frames,
        }),
        new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), VISION_EDIT_PLAN_TIMEOUT_MS)
        }),
      ])
      if (visionDecisions && visionDecisions.length >= 2) {
        decisions = visionDecisions
      }
    }
  } catch {
    /* keep structural base */
  }

  decisions = enforceDiverseEditDecisions(decisions, rows, materials, profileList)

  const bySeg = new Map<number, MixEditSegmentDecision>()
  for (const d of decisions) {
    bySeg.set(d.segmentIndex, d)
  }
  const filled = rows.map((row, i) => {
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    const clipDur = tr ? Math.max(0.35, tr.end - tr.start) : total / rows.length
    const hit = bySeg.get(i) ?? buildStructuralMixDecisions([row], materials, profileList)[0]!
    const matIdx = Math.max(0, hit.materialIndex) % materials.length
    const estDur =
      profileList.find((p) => p.index === matIdx)?.estimatedDurationSec ??
      MIX_DEFAULT_SOURCE_DURATION_SEC
    return {
      ...hit,
      segmentIndex: i,
      materialIndex: matIdx,
      sourceInSec: clampMixSourceInSec(hit.sourceInSec, clipDur, estDur),
    }
  })

  return { ok: true, decisions: filled }
}

/** 剪辑决策 → ICE 时间线段（含源片 In 点） */
export function buildIceMixSegmentsFromEditPlan(
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  decisions: MixEditSegmentDecision[],
  fallbackTotalSec: number,
  materialProfiles?: IceMixMaterialProfile[],
): IceMixSegmentPlan[] {
  const total = resolveMixTotalDurationSec(rows, fallbackTotalSec)
  const orderedRows = ensureSequentialMixScriptRows(rows, total)
  const segments: IceMixSegmentPlan[] = []
  let cursor = 0

  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i]!
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    let timelineStart: number
    let timelineEnd: number
    if (tr) {
      timelineStart = tr.start
      timelineEnd = Math.min(total, tr.end)
    } else {
      const each = total / orderedRows.length
      timelineStart = cursor
      timelineEnd = Math.min(total, cursor + each)
      cursor = timelineEnd
    }
    if (timelineEnd <= timelineStart) continue

    const dec = decisions.find((d) => d.segmentIndex === i) ?? decisions[i]
    const matIdx = dec ? dec.materialIndex % materials.length : i % materials.length
    const mat = materials[matIdx]
    if (!mat) continue

    const clipDur = timelineEnd - timelineStart
    const estDur =
      materialProfiles?.find((p) => p.index === matIdx)?.estimatedDurationSec ??
      MIX_DEFAULT_SOURCE_DURATION_SEC
    const rawIn = Math.max(0, dec?.sourceInSec ?? 0)
    const sourceInSec =
      mat.kind === 'video' ? clampMixSourceInSec(rawIn, clipDur, estDur) : 0

    segments.push({
      kind: mat.kind,
      mediaUrl: mat.mediaUrl,
      signedMediaUrl: mat.signedMediaUrl,
      materialIndex: matIdx,
      timelineStartSec: timelineStart,
      timelineEndSec: timelineEnd,
      sourceInSec,
      sourceOutSec: sourceInSec + clipDur,
      caption: row.dialogue.trim() || undefined,
    })
  }
  return segments
}
