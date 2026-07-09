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

const EDIT_PLAN_AI_TIMEOUT_MS = 12_000

const EDIT_PLAN_SYSTEM = `你是专业短视频混剪剪辑师。须根据【指导文案】【分镜表】【素材画面库】为每一段分镜做剪辑决策：
1. materialIndex：选用哪条素材（0 起算），按画面语义匹配，不是按顺序轮播；同一条素材可被多段使用，但须截取不同片段
2. sourceInSec：从该素材视频第几秒开始截取（短视频通常 3–8 秒，sourceInSec 不得超过源片时长减 1 秒；开场→0，过程→1–2s，特写→尽量靠后但留足片段长度；图片固定 0）
3. 须体现叙事：先氛围后卖点、先全景后特写等，遵循指导文案意图

只输出 JSON 数组，无 markdown：
[{"segmentIndex":0,"materialIndex":2,"sourceInSec":0,"clipNote":"门店外观"},...]
segmentIndex 从 0 起，须覆盖全部分镜段。`

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
        materialIndex: materialIndex % matCount,
        sourceInSec,
        clipNote: typeof o.clipNote === 'string' ? o.clipNote.slice(0, 80) : undefined,
      })
    }
    if (out.length < Math.min(2, segCount)) return null
    return out
  } catch {
    return null
  }
}

/** 关键词 fallback：分镜 visual 与素材描述重合度 */
function scoreMaterialMatch(visual: string, profile: IceMixMaterialProfile): number {
  const v = visual.toLowerCase()
  const d = profile.description.toLowerCase()
  if (!v.trim() || !d.trim()) return 0
  let score = 0
  const tokens = v.split(/[\s，,、；;。.]+/).filter((t) => t.length >= 2)
  for (const t of tokens) {
    if (d.includes(t)) score += 2
  }
  if (/门店|外观|环境|门头/.test(v) && /门店|外观|环境|门头/.test(d)) score += 3
  if (/产品|成品|特写|菜品|商品/.test(v) && /产品|成品|特写|菜|商品/.test(d)) score += 3
  if (/制作|过程|后厨|操作|烹饪/.test(v) && /制作|过程|后厨|操作|烹饪/.test(d)) score += 3
  if (/顾客|体验|试吃|人物/.test(v) && /顾客|体验|试吃|人物|人/.test(d)) score += 3
  return score
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
    let bestIdx = 0
    let bestScore = -1
    for (const p of profiles) {
      const s = scoreMaterialMatch(row.visual, p)
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
        `素材${p.index}（${p.label}·${p.kind === 'video' ? '视频' : '图片'}）：${p.description}${p.estimatedDurationSec ? `；约${Math.round(p.estimatedDurationSec)}秒` : ''}`,
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
    const providers: Array<'doubao' | 'qwen'> = ['doubao', 'qwen']
    for (const provider of providers) {
      try {
        const res = await postAiChat({
          provider,
          temperature: 0.25,
          messages: [
            { role: 'system', content: EDIT_PLAN_SYSTEM },
            { role: 'user', content: userBlock },
          ],
        })
        const parsed = parseEditPlanJson(res.content?.trim() || '', rows.length, materials.length)
        if (parsed) return parsed
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
