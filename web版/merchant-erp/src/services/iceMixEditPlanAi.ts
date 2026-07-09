/**
 * AI 混剪：根据指导文案 + 分镜 + 素材画面理解，规划每段用哪条素材、从哪秒截取。
 */
import { postAiChat } from './ai/aiClient'
import type { IceMixMaterialSlot } from '../lib/iceMixPlan'
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

const EDIT_PLAN_AI_TIMEOUT_MS = 30_000

const EDIT_PLAN_SYSTEM = `你是专业短视频混剪剪辑师。须根据【指导文案】【分镜表】【素材画面库】为每一段分镜做剪辑决策：
1. materialIndex：选用哪条素材（从 0 开始编号，0=第一条），按画面语义匹配；禁止 6 段全用同一条素材（除非只有 1 条素材）
2. sourceInSec：从该素材视频第几秒开始截取（短视频通常 3–8 秒；开场→0，过程→1–2s，特写→尽量靠后但留足片段长度；图片固定 0）
3. 同一条素材可被多段复用，但 sourceInSec 须明显不同（至少相差 1.5 秒）
4. 须体现叙事：先氛围后卖点、先全景后特写，遵循指导文案

只输出 JSON 数组，无 markdown：
[{"segmentIndex":0,"materialIndex":2,"sourceInSec":0,"clipNote":"门店外观"},...]
segmentIndex 从 0 起，须覆盖全部分镜段；materialIndex 从 0 起。`

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

/** 关键词 fallback：分镜 visual 与素材描述/文件名重合度 */
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

/** 禁止全段同一素材同一入点：按分镜语义重分配 */
export function enforceDiverseEditDecisions(
  decisions: MixEditSegmentDecision[],
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[],
): MixEditSegmentDecision[] {
  if (materials.length < 2 || decisions.length < 2) return decisions
  if (isEditPlanDiverseEnough(decisions, materials.length)) return decisions

  const usedIn = new Map<number, number>()
  return rows.map((row, segmentIndex) => {
    const prev = decisions.find((d) => d.segmentIndex === segmentIndex) ?? decisions[segmentIndex]
    let bestIdx = segmentIndex % materials.length
    let bestScore = -1
    for (let mi = 0; mi < materials.length; mi++) {
      const prof = profiles.find((p) => p.index === mi)
      const s = scoreMaterialMatch(
        row.visual,
        prof ?? {
          index: mi,
          label: materials[mi]!.label,
          kind: materials[mi]!.kind,
          description: materials[mi]!.label,
        },
        materials[mi]!.label,
      )
      const usedCount = decisions.filter((d) => d.materialIndex === mi).length
      const diversityBonus = usedCount === 0 ? 2 : 0
      if (s + diversityBonus > bestScore) {
        bestScore = s + diversityBonus
        bestIdx = mi
      }
    }
    const est =
      profiles.find((p) => p.index === bestIdx)?.estimatedDurationSec ?? MIX_DEFAULT_SOURCE_DURATION_SEC
    let sourceInSec = prev?.sourceInSec ?? inferSourceInSec(row.visual, est)
    const lastIn = usedIn.get(bestIdx)
    if (lastIn != null && Math.abs(sourceInSec - lastIn) < 1.2) {
      sourceInSec = clampMixSourceInSec(sourceInSec + 1.5, 3, est)
    }
    sourceInSec = clampMixSourceInSec(sourceInSec, 3, est)
    usedIn.set(bestIdx, sourceInSec)
    return {
      segmentIndex,
      materialIndex: bestIdx,
      sourceInSec,
      clipNote: prev?.clipNote,
    }
  })
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

export function fallbackMixEditDecisions(
  rows: ShortVideoScriptRow[],
  profiles: IceMixMaterialProfile[],
): MixEditSegmentDecision[] {
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
      profiles.find((p) => p.index === bestIdx)?.estimatedDurationSec ?? MIX_DEFAULT_SOURCE_DURATION_SEC
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

export async function planMixEditFromInstructions(opts: {
  guidance: string
  rows: ShortVideoScriptRow[]
  materials: IceMixMaterialSlot[]
  materialProfiles: IceMixMaterialProfile[]
  targetTotalSec: number
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

  const profileBlock = profiles
    .map(
      (p) =>
        `素材${p.index}（第${p.index + 1}条·${p.label}·${p.kind === 'video' ? '视频' : '图片'}）：${p.description}${p.estimatedDurationSec ? `；约${Math.round(p.estimatedDurationSec)}秒` : ''}`,
    )
    .join('\n')
  const storyboard = rows
    .map((r, i) => {
      const tr = parseScriptTimeRangeSeconds(r.timeRange)
      return `段${i} ${tr ? `${tr.start}-${tr.end}s` : r.timeRange} | 画面：${r.visual || '（待填）'} | 口播：${r.dialogue || '（无）'}`
    })
    .join('\n')

  const userBlock = `【指导文案】\n${opts.guidance.trim()}\n\n【素材画面库】\n${profileBlock}\n\n【分镜表】\n${storyboard}\n\n请为段0～段${rows.length - 1} 各输出一条剪辑决策 JSON。`

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

  const fallback = fallbackMixEditDecisions(rows, profileList)

  async function tryAiEditPlan(): Promise<MixEditSegmentDecision[] | null> {
    const attempts: Array<{
      provider: 'qwen' | 'doubao' | 'tokenmix'
      modelFamily?: 'openai'
      model?: string
    }> = [
      { provider: 'qwen' },
      { provider: 'doubao' },
      { provider: 'tokenmix', modelFamily: 'openai', model: 'gpt-4o' },
    ]
    for (const attempt of attempts) {
      try {
        const res = await postAiChat({
          provider: attempt.provider,
          ...(attempt.modelFamily ? { modelFamily: attempt.modelFamily, model: attempt.model } : {}),
          temperature: 0.2,
          messages: [
            { role: 'system', content: EDIT_PLAN_SYSTEM },
            { role: 'user', content: userBlock },
          ],
        })
        const parsed = parseEditPlanJson(res.content?.trim() || '', rows.length, materials.length)
        if (parsed && isEditPlanDiverseEnough(parsed, materials.length)) return parsed
      } catch {
        /* try next */
      }
    }
    return null
  }

  let decisions = fallback
  try {
    const aiDecisions = await Promise.race([
      tryAiEditPlan(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), EDIT_PLAN_AI_TIMEOUT_MS)
      }),
    ])
    if (aiDecisions && aiDecisions.length >= 2) decisions = aiDecisions
  } catch {
    /* use fallback */
  }

  decisions = enforceDiverseEditDecisions(decisions, rows, materials, profileList)

  const bySeg = new Map<number, MixEditSegmentDecision>()
  for (const d of decisions) {
    bySeg.set(d.segmentIndex, d)
  }
  const filled = rows.map((row, i) => {
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    const clipDur = tr ? Math.max(0.35, tr.end - tr.start) : total / rows.length
    const hit = bySeg.get(i) ?? fallbackMixEditDecisions([row], profileList)[0]!
    const matIdx = Math.max(0, hit.materialIndex) % materials.length
    const estDur =
      profileList.find((p) => p.index === matIdx)?.estimatedDurationSec ?? MIX_DEFAULT_SOURCE_DURATION_SEC
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
