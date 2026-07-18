/**
 * AI 混剪剪辑规划：ICE Timeline 拼接 + 视觉模型（qwen-vl / doubao-vl）匹配素材。
 * 不再使用纯文本 LLM 猜 materialIndex（易全选第一条）。
 */
import { postAiChat } from './ai/aiClient'
import { reviewMixScriptRowsWithAi } from './iceMixDialogueReviewAi'
import {
  ICE_MIX_VISION_PROVIDER_ORDER,
  ICE_MIX_TEXT_PROVIDER_ORDER,
} from './iceMixAiModels'
import {
  collectMixMaterialFramesForEditPlan,
  groupMixFramesByMaterialIndex,
  MIX_MAX_VISION_FRAMES,
  type MixMaterialFrameSample,
} from './iceMixMaterialFrames'
import {
  spreadMixMaterialIndex,
  type IceMixMaterialSlot,
  classifyMixMaterialRole,
  classifyRowNarrativeRole,
  inferMixNarrativePattern,
  mixTargetSegmentCount,
  pickMaterialsForNarrativeSlots,
  resolveMixSegmentDialogue,
  scoreMaterialRoleForSegment,
  segmentRoleForIndex,
  hasStorefrontMixMaterials,
  isMixMaterialPromotionRelevant,
  mixStorefrontGuideDialogue,
  finalizeMixScriptRows,
  formatMixPromoPlanningBlock,
  type MixPromoContext,
} from '../lib/iceMixPlan'
import {
  clampMixSourceInSec,
  ensureSequentialMixScriptRows,
  MIX_DEFAULT_SOURCE_DURATION_SEC,
  resolveMixTotalDurationSec,
  type IceMixSegmentPlan,
} from '../lib/iceMixPlan'
import {
  dialogueLinesFromGuidance,
  parseScriptTimeRangeSeconds,
  pickMixDialogueHook,
  planLongformAllFiveSecondDurations,
  sanitizeMixDialogueText,
  isMixDialogueMetaInstruction,
  scriptTimeRangesFromDurationPlan,
  type ShortVideoScriptRow,
} from '../lib/shortVideoScriptTable'

export type MixMaterialFrameBeat = {
  atSec: number
  description: string
}

export type IceMixMaterialProfile = {
  index: number
  label: string
  kind: 'video' | 'image'
  description: string
  /** 估算源片时长（秒），用于规划截取点 */
  estimatedDurationSec?: number
  /** 逐帧画面理解（源片时间点 → 描述） */
  frameTimeline?: MixMaterialFrameBeat[]
}

export type MixEditSegmentDecision = {
  segmentIndex: number
  materialIndex: number
  /** 从源素材该秒数起剪（混剪截取，非时间轴位置） */
  sourceInSec: number
  clipNote?: string
}

const VISION_EDIT_PLAN_TIMEOUT_MS = 90_000

const VISION_EDIT_PLAN_SYSTEM = `你是专业短视频混剪剪辑师（探店/餐饮/街头小吃/本地生活带货）。用户会提供【指导文案】【分镜表】以及每条素材的多帧采样截图（附图，标注源片秒数如 2.4s）。
须为每一段分镜输出剪辑决策：
1. materialIndex：选用哪条素材（从 0 开始），必须按画面语义匹配分镜「画面」与口播
2. 【硬性禁止重复】每一条素材在全片最多使用 1 次（每个 materialIndex 在数组中最多出现一次）。分镜数多于素材数时：优先覆盖全部素材，多余分镜合并到相邻段的语义说明中仍不得重复 materialIndex——此时须减少输出段数至不超过素材数，或仅输出前 N 段（N=素材数）
3. sourceInSec：从该素材第几秒起截取（须与附图秒数/画面语义一致；视频 0–12s；图片固定 0）；禁止用相近入点伪造「不同画面」
4. 叙事顺序（强制，二选一）：
   模式A（有门头/店招素材时优先）：门头门店指引(开场) → 套餐/产品/制作(中段) → 结束语(收尾)
   模式B：产品/套餐卖点钩子(开场) → 制作/体验(中段) → 门头到店指引(倒数第二段) → 结束语(收尾)
5. materialIndex 与分镜画面/口播语义一致；sourceInSec 与附图秒数匹配

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

/** 硬规则：每条素材全片最多 1 次；段数≤素材数时须全部唯一 */
function isEditPlanDiverseEnough(
  decisions: MixEditSegmentDecision[],
  matCount: number,
): boolean {
  if (decisions.length < 2 || matCount < 1) return true
  const mats = decisions.map((d) => d.materialIndex)
  const unique = new Set(mats)
  if (unique.size !== mats.length) return false
  if (decisions.length <= matCount && unique.size !== decisions.length) return false
  return true
}

/**
 * 强制每条素材全片最多出现一次；若段数 > 素材数则截断到素材数并轮换填满唯一映射。
 * 同素材禁止相近入点（防御性）。
 */
export function enforceUniqueMaterialEditDecisions(
  decisions: MixEditSegmentDecision[],
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[],
): MixEditSegmentDecision[] {
  if (!decisions.length || !materials.length) return decisions
  const maxSeg = Math.min(decisions.length, rows.length, materials.length)
  const used = new Set<number>()
  const usedIn = new Map<number, number>()
  const out: MixEditSegmentDecision[] = []

  const scoreMi = (mi: number, row: ShortVideoScriptRow, segIdx: number) => {
    const prof = profileAt(profiles, materials, mi)
    let score = scoreMaterialMatch(row.visual, prof, materials[mi]!.label)
    score += scoreMaterialMatch(row.dialogue, prof, materials[mi]!.label) * 0.6
    if (!isMixMaterialPromotionRelevant(prof, '')) score -= 2
    score += (segIdx % materials.length === mi ? 1 : 0)
    return score
  }

  for (let i = 0; i < maxSeg; i++) {
    const seed = decisions[i] ?? decisions[0]!
    const row = rows[i]!
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    const clipDur = tr ? Math.max(0.35, tr.end - tr.start) : 4

    let bestIdx = -1
    let bestScore = -1e9
    const prefer = Math.max(0, seed.materialIndex) % materials.length
    for (let mi = 0; mi < materials.length; mi++) {
      if (used.has(mi)) continue
      let score = scoreMi(mi, row, i)
      if (mi === prefer) score += 12
      if (score > bestScore) {
        bestScore = score
        bestIdx = mi
      }
    }
    if (bestIdx < 0) {
      // 理论不应发生（maxSeg≤materials.length）
      bestIdx = spreadMixMaterialIndex(i, maxSeg, materials.length)
      while (used.has(bestIdx) && used.size < materials.length) {
        bestIdx = (bestIdx + 1) % materials.length
      }
    }

    const prof = profileAt(profiles, materials, bestIdx)
    const est = prof.estimatedDurationSec ?? MIX_DEFAULT_SOURCE_DURATION_SEC
    let sourceInSec = clampMixSourceInSec(seed.sourceInSec || 0, clipDur, est)
    const lastIn = usedIn.get(bestIdx)
    if (lastIn != null && Math.abs(sourceInSec - lastIn) < 1.5) {
      sourceInSec = clampMixSourceInSec(sourceInSec + 2, clipDur, est)
    }
    used.add(bestIdx)
    usedIn.set(bestIdx, sourceInSec)
    out.push({
      segmentIndex: i,
      materialIndex: bestIdx,
      sourceInSec,
      clipNote: seed.clipNote,
    })
  }
  return out
}

function inferSourceInSec(visual: string, estDur: number, profile?: IceMixMaterialProfile): number {
  const fromTimeline = pickSourceInFromFrameTimeline(visual, '', profile?.frameTimeline)
  if (fromTimeline != null) return fromTimeline
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

/** 根据逐帧理解，为分镜画面/口播匹配最佳源片截取点 */
export function pickSourceInFromFrameTimeline(
  visual: string,
  dialogue: string,
  timeline?: MixMaterialFrameBeat[],
): number | null {
  if (!timeline?.length) return null
  const query = `${visual} ${dialogue}`.trim().toLowerCase()
  if (!query) return timeline[0]!.atSec
  let bestAt = timeline[0]!.atSec
  let bestScore = -1
  for (const beat of timeline) {
    const d = beat.description.toLowerCase()
    let score = 0
    const tokens = query.split(/[\s，,、；;。.]+/).filter((t) => t.length >= 2)
    for (const t of tokens) {
      if (d.includes(t)) score += 2
    }
    if (/门头|外观|环境|门店/.test(query) && /门头|外观|环境|门店|招牌/.test(d)) score += 4
    if (/制作|过程|烹饪|操作|后厨/.test(query) && /制作|过程|烹饪|操作|后厨|翻炒|下锅/.test(d)) score += 4
    if (/成品|特写|摆盘|菜品/.test(query) && /成品|特写|摆盘|菜|出锅/.test(d)) score += 4
    if (/试吃|顾客|体验/.test(query) && /试吃|顾客|体验|品尝/.test(d)) score += 4
    if (score > bestScore) {
      bestScore = score
      bestAt = beat.atSec
    }
  }
  return bestScore > 0 ? bestAt : timeline[Math.floor(timeline.length / 2)]!.atSec
}

function profileBlockLine(p: IceMixMaterialProfile): string {
  const timeline =
    p.frameTimeline?.length
      ? `；逐帧：${p.frameTimeline.map((b) => `${b.atSec.toFixed(1)}s ${b.description.slice(0, 36)}`).join(' | ')}`
      : ''
  return `素材${p.index}（${p.label}）：${p.description}${p.estimatedDurationSec ? `；约${Math.round(p.estimatedDurationSec)}秒` : ''}${timeline}`
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

/** 结构化分配：语义选材后硬唯一（素材不得重复） */
export function buildStructuralMixDecisions(
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[],
): MixEditSegmentDecision[] {
  const usedIn = new Map<number, number>()
  const usedMat = new Set<number>()
  const capped = rows.slice(0, materials.length)
  const raw = capped.map((row, segmentIndex) => {
    const cycleIdx = spreadMixMaterialIndex(segmentIndex, capped.length, materials.length)
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
      if (usedMat.has(mi)) continue
      const prof = profileAt(profiles, materials, mi)
      const semantic = scoreMaterialMatch(row.visual, prof, materials[mi]!.label)
      const cycleBonus = mi === cycleIdx ? 3 : 0
      const score = semantic + cycleBonus
      if (score > bestScore) {
        bestScore = score
        bestIdx = mi
      }
    }

    if (usedMat.has(bestIdx) || (materials.length >= 2 && bestScore < 4 && !usedMat.has(cycleIdx))) {
      bestIdx = -1
      for (let mi = 0; mi < materials.length; mi++) {
        if (usedMat.has(mi)) continue
        const score = scoreMaterialMatch(row.visual, profileAt(profiles, materials, mi), materials[mi]!.label)
        if (score > bestScore || bestIdx < 0) {
          bestScore = score
          bestIdx = mi
        }
      }
      if (bestIdx < 0) bestIdx = cycleIdx
    }

    usedMat.add(bestIdx)

    const est =
      profileAt(profiles, materials, bestIdx).estimatedDurationSec ??
      MIX_DEFAULT_SOURCE_DURATION_SEC
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    const clipDur = tr ? Math.max(0.35, tr.end - tr.start) : 4
    const prof = profileAt(profiles, materials, bestIdx)

    let sourceInSec = inferSourceInSec(row.visual, est, prof)
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
  return enforceUniqueMaterialEditDecisions(raw, capped, materials, profiles)
}

/** 禁止重复素材/重复画面：始终走硬唯一分配 */
export function enforceDiverseEditDecisions(
  decisions: MixEditSegmentDecision[],
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[],
): MixEditSegmentDecision[] {
  if (!materials.length || !decisions.length) return decisions
  if (isEditPlanDiverseEnough(decisions, materials.length) && decisions.length <= materials.length) {
    return decisions.slice(0, Math.min(decisions.length, materials.length))
  }
  return enforceUniqueMaterialEditDecisions(decisions, rows, materials, profiles)
}

/**
 * 按分镜表语义匹配素材与截取点（尊重用户分镜顺序，智能选素材/入点）
 */
export function buildStoryboardMixDecisions(
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[],
  userSlots?: number[],
  guidance = '',
): MixEditSegmentDecision[] {
  const usedIn = new Map<number, number>()
  const usedMats = new Set<number>()
  const pattern = inferMixNarrativePattern(
    guidance || rows.map((r) => `${r.visual} ${r.dialogue}`).join(' '),
    profiles,
  )
  const segCount = Math.min(rows.length, materials.length)

  const raw = rows.slice(0, segCount).map((row, segmentIndex) => {
    let bestIdx = -1
    let bestScore = -1e9
    const slotRole = segmentRoleForIndex(segmentIndex, segCount, pattern)
    const rowRole = classifyRowNarrativeRole(row.visual, row.dialogue)
    const cycleIdx = spreadMixMaterialIndex(segmentIndex, segCount, materials.length)

    for (let mi = 0; mi < materials.length; mi++) {
      if (usedMats.has(mi)) continue
      const prof = profileAt(profiles, materials, mi)
      if (!isMixMaterialPromotionRelevant(prof, guidance)) continue
      let score = scoreMaterialMatch(row.visual, prof, materials[mi]!.label)
      score += scoreMaterialMatch(row.dialogue, prof, materials[mi]!.label) * 0.6

      const matRole = classifyMixMaterialRole(prof.description, prof.label, prof.frameTimeline)
      score += scoreMaterialRoleForSegment(matRole, slotRole) * 1.8
      if (rowRole === matRole || rowRole === slotRole) score += 8
      if (slotRole === 'storefront' && matRole === 'storefront') score += 10

      const frameIn = pickSourceInFromFrameTimeline(row.visual, row.dialogue, prof.frameTimeline)
      if (frameIn != null && prof.frameTimeline?.length) {
        score += 8
      }

      if (userSlots?.[segmentIndex] === mi) score += 3
      if (mi === cycleIdx) score += 2

      if (score > bestScore) {
        bestScore = score
        bestIdx = mi
      }
    }

    if (bestIdx < 0) {
      const picks = pickMaterialsForNarrativeSlots(segCount, materials, profiles, guidance)
      bestIdx = picks[segmentIndex] ?? cycleIdx
      if (usedMats.has(bestIdx)) {
        bestIdx = [...Array(materials.length).keys()].find((mi) => !usedMats.has(mi)) ?? cycleIdx
      }
    }

    usedMats.add(bestIdx)

    const prof = profileAt(profiles, materials, bestIdx)
    const est = prof.estimatedDurationSec ?? MIX_DEFAULT_SOURCE_DURATION_SEC
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    const clipDur = tr ? Math.max(0.35, tr.end - tr.start) : 4

    let sourceInSec =
      pickSourceInFromFrameTimeline(row.visual, row.dialogue, prof.frameTimeline) ??
      inferSourceInSec(row.visual, est, prof)

    const lastIn = usedIn.get(bestIdx)
    if (lastIn != null && Math.abs(sourceInSec - lastIn) < 1.5) {
      sourceInSec = clampMixSourceInSec(sourceInSec + 2, clipDur, est)
    }
    sourceInSec = clampMixSourceInSec(sourceInSec, clipDur, est)
    usedIn.set(bestIdx, sourceInSec)

    return { segmentIndex, materialIndex: bestIdx, sourceInSec }
  })

  return enforceUniqueMaterialEditDecisions(raw, rows.slice(0, segCount), materials, profiles)
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
    const prof = profiles.find((p) => p.index === bestIdx)
    let sourceInSec = inferSourceInSec(row.visual, est, prof)
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
  frames: MixMaterialFrameSample[]
}): Promise<MixEditSegmentDecision[] | null> {
  if (opts.frames.length < 1) return null

  const profileBlock = opts.profiles.map((p) => profileBlockLine(p)).join('\n')
  const storyboard = opts.rows
    .map((r, i) => {
      const tr = parseScriptTimeRangeSeconds(r.timeRange)
      return `段${i} ${tr ? `${tr.start}-${tr.end}s` : r.timeRange} | 画面：${r.visual || '（待填）'} | 口播：${r.dialogue || '（无）'}`
    })
    .join('\n')
  const frameLegend = opts.frames
    .map((f, i) => {
      const sec = f.atSec != null ? `@${f.atSec.toFixed(1)}s` : ''
      return `附图${i + 1} = 素材${f.index}${sec}（${f.label}）`
    })
    .join('\n')

  const userBlock = `【指导文案】\n${opts.guidance.trim()}\n\n【素材画面库】\n${profileBlock}\n\n【分镜表】\n${storyboard}\n\n【附图对应关系】\n${frameLegend}\n\n请为段0～段${opts.rows.length - 1} 各输出一条剪辑决策 JSON。`

  const imageDataUrls = opts.frames.map((f) => f.dataUrl).slice(0, 24)

  for (const { provider, model } of ICE_MIX_VISION_PROVIDER_ORDER) {
    try {
      const res = await postAiChat({
        provider,
        model,
        temperature: 0.12,
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
  seedDecisions?: MixEditSegmentDecision[]
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
      : materials.map(
          (m, i): IceMixMaterialProfile => ({
            index: i,
            label: m.label,
            kind: m.kind,
            description: m.label,
            estimatedDurationSec: m.kind === 'video' ? MIX_DEFAULT_SOURCE_DURATION_SEC : undefined,
          }),
        )

  let decisions =
    opts.seedDecisions?.length === rows.length
      ? opts.seedDecisions
      : buildStructuralMixDecisions(rows, materials, profileList)

  opts.onProgress?.('视觉模型正在匹配素材画面与口播…')
  try {
    const frames = await Promise.race([
      collectMixMaterialFramesForEditPlan(materials, {
        maxFrames: Math.min(MIX_MAX_VISION_FRAMES, Math.max(24, Math.min(materials.length, 16) * 5)),
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
        decisions = rows.map((_, i) => {
          const vis =
            visionDecisions.find((d) => d.segmentIndex === i) ?? visionDecisions[i]
          const seed = decisions[i]!
          if (!vis) return seed
          return {
            segmentIndex: i,
            materialIndex: vis.materialIndex % materials.length,
            sourceInSec: vis.sourceInSec,
            clipNote: vis.clipNote ?? seed.clipNote,
          }
        })
      }
    }
  } catch {
    /* keep seed / structural base */
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

export type MixNarrativeSegment = {
  segmentIndex: number
  materialIndex: number
  sourceInSec: number
  visual: string
  dialogue: string
  clipNote?: string
}

const NARRATIVE_TEXT_PLAN_SYSTEM = `你是专业短视频混剪导演（探店/餐饮/本地生活）。用户会提供【指导文案】和【素材画面库】（每条素材有 AI 画面描述，materialIndex 从 0 开始）。

任务（强制）：
1. 输出恰好 K 段分镜（K 由用户指定，对应目标成片总时长），每段选用 1 条最匹配素材，同一条素材最多出现 1 次
2. 跳过与推广/产品/门店毫无关联的素材（如纯风景、马路、截帧失败、无关路人等），materialIndex 不得选用这类素材
3. 叙事结构（写死：有门头素材默认模式A；仅文案明确要求门头收尾才用模式B）：
   模式A：门头/门店指引(开场) → 套餐/产品/制作过程(中段) → 结束语/行动号召(收尾)
   模式B：产品/套餐卖点钩子(开场) → 制作/试吃体验(中段) → 门头/到店指引(倒数第二段) → 结束语(收尾)
4. 每段 visual（画面描述，给剪辑看）与 dialogue（口播台词，给观众听）语义一致
5. dialogue 必须是可直接 TTS 朗读的第一人称/现场旁白短句（每段 12～28 字），禁止指导文案摘要与提示语（如「这是一支以…为主题的短视频」「开篇以门头…引入」「最后以…收尾，结合口播强调…引导用户」）；禁止占位符；禁止「核心卖点」「叙事节奏」「目标受众」等编导标签；禁止第三人称说明「他们注重…」；禁止照搬指导文案整段
6. 各段 dialogue 不得相同或相近；若用户提供主推商品/原价/优惠价：中段恰好 1 段口播带商品名（不含价格数字），最后 1 段口播报价（全片仅此 1 段出现原价/优惠价）
7. visual 写该段画面内容；dialogue 写该段旁白，须与 visual 同一段画面匹配（门头段只讲到店指引/门店信息）
8. segmentIndex 从 0 连续递增，表示成片时间轴顺序

只输出 JSON 对象，无 markdown：
{"segments":[{"segmentIndex":0,"materialIndex":5,"visual":"门店门头…","dialogue":"走进这家…"},...]}`

const CLIP_POINT_VISION_SYSTEM = `你是混剪剪辑师。用户给出已排好叙事顺序的分镜段，以及对应素材的多帧采样截图（附图标注源片秒数）。
须为每段输出从源素材第几秒起剪（sourceInSec）：
- 视频：须与 visual/dialogue 语义及附图秒数匹配（如口播讲成品则用标注成品画面的秒数附近）
- 图片：0
- 同素材复用时 sourceInSec 至少相差 1.5 秒

只输出 JSON 数组：
[{"segmentIndex":0,"materialIndex":5,"sourceInSec":1.2,"clipNote":"翻炒特写"},...]`

function isMixProfileDescriptionUsable(desc: string): boolean {
  const t = desc.trim()
  return t.length >= 24 && !/截帧失败|无法识别|分析失败/i.test(t)
}

/** 已有「AI 分析素材」结果时，规划分镜不必再对全库逐帧截帧 */
function profilesReadyForClipRefine(
  profiles: IceMixMaterialProfile[],
  materialCount: number,
): boolean {
  const minUsable = Math.min(materialCount, Math.max(4, Math.ceil(materialCount * 0.35)))
  const withTimeline = profiles.filter((p) => (p.frameTimeline?.length ?? 0) >= 1).length
  const withDesc = profiles.filter((p) => isMixProfileDescriptionUsable(p.description)).length
  return (
    withTimeline >= minUsable ||
    withDesc >= Math.min(materialCount, Math.ceil(materialCount * 0.4))
  )
}

function applyClipPointsFromProfiles(
  segments: MixNarrativeSegment[],
  profileList: IceMixMaterialProfile[],
): MixNarrativeSegment[] {
  return segments.map((s) => {
    const prof = profileList.find((p) => p.index === s.materialIndex)
    const est = prof?.estimatedDurationSec ?? MIX_DEFAULT_SOURCE_DURATION_SEC
    const fromTimeline = pickSourceInFromFrameTimeline(s.visual, s.dialogue, prof?.frameTimeline)
    const sourceInSec =
      fromTimeline != null ? fromTimeline : inferSourceInSec(s.visual, est, prof)
    return { ...s, sourceInSec: clampMixSourceInSec(sourceInSec, 1.2, est) }
  })
}

function dialogueLinesFromGuidanceText(guidance: string): string[] {
  return dialogueLinesFromGuidance(guidance)
}

function normalizeNarrativeSegmentDialogues(
  segments: MixNarrativeSegment[],
  guidance: string,
  promo?: MixPromoContext,
): MixNarrativeSegment[] {
  const guidanceLines = dialogueLinesFromGuidance(guidance).filter(
    (l) => !isMixDialogueMetaInstruction(l),
  )
  const hook = pickMixDialogueHook(guidance, '探店好物推荐')
  const total = segments.length
  return segments.map((s, i) => ({
    ...s,
    dialogue: resolveMixSegmentDialogue({
      rawDialogue: s.dialogue,
      visual: s.visual,
      guidanceLines,
      lineIndex: i,
      hook,
      totalRows: total,
      promo,
    }),
  }))
}

function parseNarrativePlanJson(
  raw: string,
  matCount: number,
): MixNarrativeSegment[] | null {
  const objMatch = raw.match(/\{[\s\S]*"segments"[\s\S]*\}/)
  const arrMatch = raw.match(/\[[\s\S]*\]/)
  let arr: unknown[] | null = null
  if (objMatch) {
    try {
      const o = JSON.parse(objMatch[0]) as { segments?: unknown[] }
      if (Array.isArray(o.segments)) arr = o.segments
    } catch {
      /* fall through */
    }
  }
  if (!arr && arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]) as unknown
      if (Array.isArray(parsed)) arr = parsed
    } catch {
      return null
    }
  }
  if (!arr) return null

  const out: MixNarrativeSegment[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const segmentIndex = Number(o.segmentIndex)
    const materialIndex = Number(o.materialIndex)
    const visual = String(o.visual ?? '').trim()
    const dialogueRaw = String(o.dialogue ?? '').trim()
    let dialogue = sanitizeMixDialogueText(dialogueRaw)
    if (isMixDialogueMetaInstruction(dialogueRaw) || isMixDialogueMetaInstruction(dialogue)) {
      dialogue = ''
    }
    if (!Number.isFinite(segmentIndex) || segmentIndex < 0) continue
    if (!Number.isFinite(materialIndex) || materialIndex < 0) continue
    if (visual.length < 2 && dialogue.length < 2) continue
    out.push({
      segmentIndex,
      materialIndex: Math.max(0, materialIndex),
      sourceInSec: Math.max(0, Number(o.sourceInSec) || 0),
      visual: visual || dialogue.slice(0, 72),
      dialogue: dialogue || '',
      clipNote: typeof o.clipNote === 'string' ? o.clipNote.slice(0, 80) : undefined,
    })
  }
  if (out.length < Math.min(2, matCount)) return null
  const hasZero = out.some((d) => d.materialIndex === 0)
  const oneBased =
    !hasZero && out.every((d) => d.materialIndex >= 1 && d.materialIndex <= matCount)
  return out.map((s) => ({
    ...s,
    materialIndex: oneBased
      ? Math.max(0, s.materialIndex - 1)
      : Math.max(0, s.materialIndex) % matCount,
  }))
}

/** 保证每条素材恰好一次，并按叙事 segmentIndex 排序 */
export function ensureFullMaterialNarrativeCoverage(
  raw: MixNarrativeSegment[],
  matCount: number,
  profiles: IceMixMaterialProfile[],
  guidance: string,
  materials: IceMixMaterialSlot[] = [],
): MixNarrativeSegment[] {
  const guidanceLines = dialogueLinesFromGuidanceText(guidance).filter(
    (l) => !isMixDialogueMetaInstruction(l),
  )
  const hook = pickMixDialogueHook(guidance, '探店好物推荐')
  const sorted = [...raw].sort((a, b) => a.segmentIndex - b.segmentIndex)
  const usedMats = new Set<number>()
  const result: MixNarrativeSegment[] = []

  for (const s of sorted) {
    const mi = s.materialIndex % matCount
    if (usedMats.has(mi)) continue
    usedMats.add(mi)
    const prof = profileAt(profiles, materials, mi)
    result.push({
      segmentIndex: result.length,
      materialIndex: mi,
      sourceInSec: s.sourceInSec,
      visual: s.visual.trim() || prof.description.slice(0, 72) || `素材${mi + 1}画面`,
      dialogue:
        s.dialogue.trim() ||
        guidanceLines[result.length % Math.max(1, guidanceLines.length)] ||
        hook,
      clipNote: s.clipNote,
    })
  }

  for (let mi = 0; mi < matCount; mi++) {
    if (usedMats.has(mi)) continue
    const prof = profileAt(profiles, materials, mi)
    result.push({
      segmentIndex: result.length,
      materialIndex: mi,
      sourceInSec: 0,
      visual: prof.description.slice(0, 72) || `素材${mi + 1}画面`,
      dialogue:
        guidanceLines[result.length % Math.max(1, guidanceLines.length)] ||
        hook,
    })
  }

  return result.map((s, i) => ({ ...s, segmentIndex: i }))
}

function narrativeSegmentsToRows(
  segments: MixNarrativeSegment[],
  targetTotalSec: number,
  promo?: MixPromoContext,
): ShortVideoScriptRow[] {
  const total = Math.min(120, Math.max(5, Math.ceil(targetTotalSec)))
  const plan = planLongformAllFiveSecondDurations(total)
  const targetCount = plan.length
  const ranges = scriptTimeRangesFromDurationPlan(plan)
  const padded: MixNarrativeSegment[] = [...segments]
  while (padded.length < targetCount) {
    const src = segments[padded.length % Math.max(1, segments.length)]!
    padded.push({
      ...src,
      segmentIndex: padded.length,
      dialogue: '',
    })
  }
  const rows = padded.slice(0, targetCount).map((s, i) => ({
    timeRange: ranges[i]!,
    visual: s.visual.trim(),
    dialogue: s.dialogue.trim(),
  }))
  return finalizeMixScriptRows(ensureSequentialMixScriptRows(rows, total), '探店实拍，值得期待', promo)
}

function narrativeSegmentsToDecisions(segments: MixNarrativeSegment[]): MixEditSegmentDecision[] {
  return segments.map((s, i) => ({
    segmentIndex: i,
    materialIndex: s.materialIndex,
    sourceInSec: s.sourceInSec,
    clipNote: s.clipNote,
  }))
}

async function tryTextNarrativePlan(opts: {
  guidance: string
  materials: IceMixMaterialSlot[]
  profiles: IceMixMaterialProfile[]
  targetSegmentCount: number
  promo?: MixPromoContext
}): Promise<MixNarrativeSegment[] | null> {
  const matCount = opts.materials.length
  const k = opts.targetSegmentCount
  const profileBlock = opts.profiles.map((p) => profileBlockLine(p)).join('\n')
  const hasStore = hasStorefrontMixMaterials(opts.profiles)
  const patternHint = hasStore
    ? '检测到门头/门店类素材，优先采用模式A（门头开场）'
    : '可采用模式B（产品钩子开场，收尾前补门店指引）'
  const promoBlock = formatMixPromoPlanningBlock(opts.promo)

  const userBlock = [
    `【指导文案】\n${opts.guidance.trim()}`,
    promoBlock,
    `【素材画面库 共 ${matCount} 条】\n${profileBlock}`,
    `【成片要求】\n- 输出恰好 ${k} 段分镜（对应目标时长，每段约 5 秒）\n- 从 ${matCount} 条素材中各选最匹配的 ${k} 条（每条素材最多用 1 次）\n- ${patternHint}\n- 各段口播不得重复；有主推商品时中段 1 段带商品名、最后 1 段报价\n\n请输出 ${k} 段叙事分镜 JSON。`,
  ]
    .filter(Boolean)
    .join('\n\n')

  for (const { provider, model } of ICE_MIX_TEXT_PROVIDER_ORDER) {
    try {
      const res = await postAiChat({
        provider,
        model,
        ...(provider === 'tokenmix' ? { modelFamily: 'openai' as const } : {}),
        temperature: 0.2,
        messages: [
          { role: 'system', content: NARRATIVE_TEXT_PLAN_SYSTEM },
          { role: 'user', content: userBlock },
        ],
      })
      const parsed = parseNarrativePlanJson(res.content?.trim() || '', matCount)
      if (parsed && parsed.length >= Math.min(2, k)) return parsed.slice(0, k)
    } catch {
      /* try next */
    }
  }
  return null
}

async function refineClipPointsWithVision(opts: {
  segments: MixNarrativeSegment[]
  materials: IceMixMaterialSlot[]
  profiles: IceMixMaterialProfile[]
  framesByMaterial: Map<number, MixMaterialFrameSample[]>
}): Promise<MixEditSegmentDecision[] | null> {
  const chunkSize = 6
  const merged = new Map<number, MixEditSegmentDecision>()

  for (let start = 0; start < opts.segments.length; start += chunkSize) {
    const chunk = opts.segments.slice(start, start + chunkSize)
    const frameList: MixMaterialFrameSample[] = []
    for (const seg of chunk) {
      const frames = opts.framesByMaterial.get(seg.materialIndex) ?? []
      for (const f of frames.slice(0, 5)) {
        if (frameList.length < 24) frameList.push(f)
      }
    }
    if (frameList.length < 1) continue

    const storyboard = chunk
      .map(
        (s) =>
          `段${s.segmentIndex} materialIndex=${s.materialIndex} | 画面：${s.visual} | 口播：${s.dialogue}`,
      )
      .join('\n')
    const frameLegend = frameList
      .map((f, i) => {
        const sec = f.atSec != null ? `@${f.atSec.toFixed(1)}s` : ''
        return `附图${i + 1} = 素材${f.index}${sec}（${f.label}${f.tag ? `·${f.tag}` : ''}）`
      })
      .join('\n')
    const userBlock = `【分镜段】\n${storyboard}\n\n【附图】\n${frameLegend}\n\n请为以上各段输出 sourceInSec。`

    for (const { provider, model } of ICE_MIX_VISION_PROVIDER_ORDER) {
      try {
        const res = await postAiChat({
          provider,
          model,
          temperature: 0.12,
          imageDataUrls: frameList.map((f) => f.dataUrl).slice(0, 24),
          messages: [
            { role: 'system', content: CLIP_POINT_VISION_SYSTEM },
            { role: 'user', content: userBlock },
          ],
        })
        const parsed = parseEditPlanJson(
          res.content?.trim() || '',
          opts.segments.length,
          opts.materials.length,
        )
        if (!parsed) continue
        for (const d of parsed) {
          merged.set(d.segmentIndex, d)
        }
        break
      } catch {
        /* try next provider */
      }
    }
  }

  if (merged.size < Math.min(2, opts.segments.length)) return null
  return opts.segments.map((s, i) => {
    const hit = merged.get(s.segmentIndex) ?? merged.get(i)
    const mi = hit?.materialIndex ?? s.materialIndex
    const est =
      opts.profiles.find((p) => p.index === mi)?.estimatedDurationSec ??
      MIX_DEFAULT_SOURCE_DURATION_SEC
    const sourceInSec = clampMixSourceInSec(hit?.sourceInSec ?? s.sourceInSec, 1.2, est)
    return {
      segmentIndex: i,
      materialIndex: mi,
      sourceInSec,
      clipNote: hit?.clipNote ?? s.clipNote,
    }
  })
}

const NARRATIVE_CLOSING_RE = /下单|团购|赶紧|快来|收藏|关注|就在|欢迎.*到店|点击|马上|结束|收尾/
const NARRATIVE_STOREFRONT_RE =
  /门头|店招|招牌|门店|门面|地址|导航|怎么找|在哪里|欢迎来|进店/

function fitNarrativeSegmentsToTargetDuration(
  raw: MixNarrativeSegment[],
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[],
  guidance: string,
  targetTotalSec: number,
  segmentSec = 5,
): MixNarrativeSegment[] {
  const targetCount = mixTargetSegmentCount(targetTotalSec, segmentSec)
  const usedMats = new Set<number>()
  const deduped: MixNarrativeSegment[] = []
  for (const s of [...raw].sort((a, b) => a.segmentIndex - b.segmentIndex)) {
    const mi = s.materialIndex % materials.length
    const prof = profiles[mi] ?? {
      index: mi,
      label: materials[mi]?.label ?? `素材${mi + 1}`,
      description: materials[mi]?.label ?? '',
    }
    if (!isMixMaterialPromotionRelevant(prof, guidance)) continue
    if (usedMats.has(mi)) continue
    usedMats.add(mi)
    deduped.push({ ...s, materialIndex: mi, segmentIndex: deduped.length })
    if (deduped.length >= targetCount) break
  }

  if (deduped.length === targetCount) {
    return deduped.map((s, i) => ({ ...s, segmentIndex: i }))
  }

  return buildFallbackNarrativeFromProfiles(
    materials,
    profiles,
    guidance,
    targetTotalSec,
    segmentSec,
  )
}

function buildFallbackNarrativeFromProfiles(
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[],
  guidance: string,
  targetTotalSec: number,
  segmentSec = 5,
): MixNarrativeSegment[] {
  const guidanceLines = dialogueLinesFromGuidanceText(guidance).filter(
    (l) => !isMixDialogueMetaInstruction(l),
  )
  const hook = pickMixDialogueHook(guidance, '探店好物推荐')
  const targetCount = mixTargetSegmentCount(targetTotalSec, segmentSec)
  const picks = pickMaterialsForNarrativeSlots(targetCount, materials, profiles, guidance)
  const pattern = inferMixNarrativePattern(guidance, profiles)

  return picks.map((mi, i) => {
    const prof = profileAt(profiles, materials, mi)
    const mat = materials[mi]!
    const slotRole = segmentRoleForIndex(i, picks.length, pattern)
    const visualBase = prof.description.slice(0, 96) || `${mat.label}画面`
    const visual =
      slotRole === 'storefront' ? `门店门头/环境：${visualBase}` : visualBase

    let dialogue = ''
    if (slotRole === 'closing') {
      dialogue =
        guidanceLines.find((l) => NARRATIVE_CLOSING_RE.test(l)) ||
        guidanceLines[guidanceLines.length - 1] ||
        `${hook}，欢迎到店体验！`
    } else if (slotRole === 'storefront') {
      dialogue =
        guidanceLines.find((l) => NARRATIVE_STOREFRONT_RE.test(l)) ||
        mixStorefrontGuideDialogue(hook)
    } else if (i === 0 && pattern === 'hook_opening') {
      dialogue = guidanceLines[0] || hook
    } else {
      const mid = guidanceLines.slice(1, Math.max(1, guidanceLines.length - 1))
      dialogue =
        mid[i % Math.max(1, mid.length)] ||
        guidanceLines[i % Math.max(1, guidanceLines.length)] ||
        hook
    }

    dialogue = resolveMixSegmentDialogue({
      rawDialogue: dialogue,
      visual,
      guidanceLines,
      lineIndex: i,
      hook,
    })

    return {
      segmentIndex: i,
      materialIndex: mi,
      sourceInSec: inferSourceInSec(visual, prof.estimatedDurationSec ?? 6, prof),
      visual,
      dialogue,
    }
  })
}

/**
 * AI 叙事规划：理解素材画面 → 按指导文案排序 → 口播画面对齐 → 确定截取点。
 * 输出分镜 rows + 剪辑 decisions（materialIndex 为叙事顺序，非上传顺序）。
 */
export async function planMixNarrativeFromVision(opts: {
  guidance: string
  materials: IceMixMaterialSlot[]
  materialProfiles: IceMixMaterialProfile[]
  targetTotalSec: number
  promo?: MixPromoContext
  onProgress?: (msg: string) => void
}): Promise<
  | {
      ok: true
      rows: ShortVideoScriptRow[]
      decisions: MixEditSegmentDecision[]
      materialSlots: number[]
    }
  | { ok: false; message: string }
> {
  const materials = opts.materials
  const guidance = opts.guidance.trim()
  if (materials.length < 2) return { ok: false, message: '至少 2 条素材' }
  if (guidance.length < 4) return { ok: false, message: '请先填写指导文案' }

  const profileList =
    opts.materialProfiles.length > 0
      ? opts.materialProfiles
      : materials.map(
          (m, i): IceMixMaterialProfile => ({
            index: i,
            label: m.label,
            kind: m.kind,
            description: m.label,
            estimatedDurationSec: m.kind === 'video' ? MIX_DEFAULT_SOURCE_DURATION_SEC : undefined,
          }),
        )

  const usableProfiles = profileList.filter((p) => isMixProfileDescriptionUsable(p.description))
  if (usableProfiles.length < Math.min(materials.length, Math.ceil(materials.length * 0.4))) {
    return {
      ok: false,
      message: '请先点击「AI 分析素材」理解每条素材画面，再规划叙事分镜',
    }
  }

  opts.onProgress?.('AI 正在按指导文案规划叙事顺序与口播…')
  const targetSegmentCount = mixTargetSegmentCount(opts.targetTotalSec, 5)
  let segments: MixNarrativeSegment[] | null = await tryTextNarrativePlan({
    guidance,
    materials,
    profiles: profileList,
    targetSegmentCount,
    promo: opts.promo,
  })

  if (!segments) {
    opts.onProgress?.('叙事 JSON 解析失败，按门头→产品→收尾自动排序…')
    segments = buildFallbackNarrativeFromProfiles(
      materials,
      profileList,
      guidance,
      opts.targetTotalSec,
      5,
    )
  }

  segments = fitNarrativeSegmentsToTargetDuration(
    segments,
    materials,
    profileList,
    guidance,
    opts.targetTotalSec,
    5,
  )

  segments = normalizeNarrativeSegmentDialogues(segments, guidance, opts.promo)

  if (profilesReadyForClipRefine(profileList, materials.length)) {
    opts.onProgress?.('复用 AI 分析结果，匹配各段截取点…')
    segments = applyClipPointsFromProfiles(segments, profileList)
  } else {
    opts.onProgress?.('密集采样素材画面，确定各段截取点…')
    try {
      const durationMap = new Map<number, number>()
      for (const p of profileList) {
        if (p.estimatedDurationSec) durationMap.set(p.index, p.estimatedDurationSec)
      }
      const frames = await Promise.race([
        collectMixMaterialFramesForEditPlan(materials, {
          allMaterials: materials.length <= 16,
          maxFrames: Math.min(MIX_MAX_VISION_FRAMES, materials.length * 3),
          materialDurations: durationMap,
          onProgress: opts.onProgress,
        }),
        new Promise<MixMaterialFrameSample[]>((resolve) => {
          window.setTimeout(() => resolve([]), VISION_EDIT_PLAN_TIMEOUT_MS)
        }),
      ])

      if (frames.length >= 1) {
        opts.onProgress?.('视觉模型精修截取点…')
        const framesByMaterial = groupMixFramesByMaterialIndex(frames)
        const clipDecisions = await Promise.race([
          refineClipPointsWithVision({
            segments,
            materials,
            profiles: profileList,
            framesByMaterial,
          }),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), VISION_EDIT_PLAN_TIMEOUT_MS)
          }),
        ])
        if (clipDecisions) {
          segments = segments.map((s, i) => {
            const d = clipDecisions.find((x) => x.segmentIndex === i) ?? clipDecisions[i]
            const prof = profileList.find((p) => p.index === (d?.materialIndex ?? s.materialIndex))
            const timelineIn =
              d?.sourceInSec ??
              pickSourceInFromFrameTimeline(s.visual, s.dialogue, prof?.frameTimeline) ??
              s.sourceInSec
            return d
              ? {
                  ...s,
                  materialIndex: d.materialIndex,
                  sourceInSec: timelineIn,
                  clipNote: d.clipNote,
                }
              : s
          })
        } else {
          segments = applyClipPointsFromProfiles(segments, profileList)
        }
      } else {
        segments = applyClipPointsFromProfiles(segments, profileList)
      }
    } catch {
      segments = applyClipPointsFromProfiles(segments, profileList)
    }
  }

  for (const s of segments) {
    if (materials[s.materialIndex]?.kind === 'image') s.sourceInSec = 0
    else {
      const est =
        profileList.find((p) => p.index === s.materialIndex)?.estimatedDurationSec ??
        MIX_DEFAULT_SOURCE_DURATION_SEC
      s.sourceInSec = clampMixSourceInSec(s.sourceInSec, 1.2, est)
    }
  }

  const rows = narrativeSegmentsToRows(segments, opts.targetTotalSec, opts.promo)
  let reviewedRows = rows
  try {
    reviewedRows = await reviewMixScriptRowsWithAi(rows, opts.onProgress, opts.promo)
  } catch {
    reviewedRows = finalizeMixScriptRows(rows, '探店实拍，值得期待', opts.promo)
  }
  const decisions = narrativeSegmentsToDecisions(segments)
  const materialSlots = segments.map((s) => s.materialIndex)

  return { ok: true, rows: reviewedRows, decisions, materialSlots }
}
