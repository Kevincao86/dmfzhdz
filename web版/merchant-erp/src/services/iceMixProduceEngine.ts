/**
 * AI 混剪成片引擎：ICE Timeline 多素材拼接 + 截取 + 转场 + 动效字幕 + AI_TTS。
 * 素材映射以轮询/用户下拉为准，视觉 AI 仅优化截取点，禁止全段指向第一条素材。
 */
import { postAiChat } from './ai/aiClient'
import { collectMixMaterialFramesForEditPlan } from './iceMixMaterialFrames'
import type { IceMixMaterialProfile } from './iceMixEditPlanAi'
import { validateIceMixMaterialUrl, sanitizeIceMixMaterialUrlForPipeline } from '../lib/icePipelineImageUrl'
import type { IceMixMaterialSlot, IceMixSegmentPlan } from '../lib/iceMixPlan'
import {
  assignMixMaterialSlots,
  canonicalMixMediaKey,
  clampMixSourceInSec,
  collectMixNarrationText,
  composeMixEditBrief,
  ensureSequentialMixScriptRows,
  MIX_DEFAULT_SOURCE_DURATION_SEC,
  normalizeMixMaterialSlots,
  resolveMixTotalDurationSec,
} from '../lib/iceMixPlan'
import {
  parseScriptTimeRangeSeconds,
  type ShortVideoScriptRow,
} from '../lib/shortVideoScriptTable'

const VISION_SOURCE_IN_TIMEOUT_MS = 18_000

export type IceMixProduceInput = {
  rows: ShortVideoScriptRow[]
  materials: IceMixMaterialSlot[]
  materialSlots: number[]
  materialProfiles?: IceMixMaterialProfile[]
  targetTotalSec: number
  guidance?: string
  mixInstruction?: string
  effectId: string
  subtitleStyleId: string
  onProgress?: (msg: string) => void
}

export type IceMixProduceOutput = {
  segments: IceMixSegmentPlan[]
  editBrief: string
  narrationText: string
  effectId: string
  subtitleStyleId: string
  materialSlots: number[]
  summary: string
}

function inferSourceInSec(visual: string, estDur: number, segmentIndex: number): number {
  const dur = Math.max(2, Math.min(estDur || MIX_DEFAULT_SOURCE_DURATION_SEC, 15))
  let base = 0
  if (/成品|特写|结尾|收尾|logo|招牌菜/.test(visual)) {
    base = clampMixSourceInSec(Math.min(dur * 0.4, Math.max(0, dur - 2)), 1, dur)
  } else if (/过程|制作|烹饪|操作|后厨|加工|搅拌/.test(visual)) {
    base = clampMixSourceInSec(Math.min(dur * 0.18, Math.max(0, dur - 1.5)), 1, dur)
  } else if (/顾客|体验|试吃|互动/.test(visual)) {
    base = clampMixSourceInSec(Math.min(dur * 0.28, Math.max(0, dur - 1.5)), 1, dur)
  }
  const stagger = (segmentIndex % 4) * 1.35
  return clampMixSourceInSec(base + stagger, 1.2, dur)
}

function profileAt(
  profiles: IceMixMaterialProfile[] | undefined,
  materials: IceMixMaterialSlot[],
  mi: number,
): IceMixMaterialProfile {
  return (
    profiles?.find((p) => p.index === mi) ?? {
      index: mi,
      label: materials[mi]!.label,
      kind: materials[mi]!.kind,
      description: materials[mi]!.label,
      estimatedDurationSec:
        materials[mi]!.kind === 'video' ? MIX_DEFAULT_SOURCE_DURATION_SEC : undefined,
    }
  )
}

/** 强制多素材：轮询 + 用户映射，并校验 canonical URL 分散 */
export function resolveMixMaterialSlotMapping(
  rowCount: number,
  materials: IceMixMaterialSlot[],
  userSlots: number[],
): number[] {
  const roundRobin = assignMixMaterialSlots(rowCount, materials.length)
  let slots =
    userSlots.length === rowCount
      ? normalizeMixMaterialSlots(userSlots, rowCount, materials.length)
      : roundRobin

  if (materials.length >= 2 && rowCount >= 2) {
    const keys = slots.map((mi) =>
      canonicalMixMediaKey(materials[mi]!.mediaUrl || materials[mi]!.signedMediaUrl || ''),
    )
    if (new Set(keys).size < 2) {
      slots = roundRobin
    }
    if (new Set(slots).size < 2) {
      slots = roundRobin
    }
  }
  return slots
}

export function buildIceMixSegmentsFromSlots(
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  materialSlots: number[],
  fallbackTotalSec: number,
  materialProfiles?: IceMixMaterialProfile[],
): IceMixSegmentPlan[] {
  if (!rows.length || !materials.length) return []
  const total = resolveMixTotalDurationSec(rows, fallbackTotalSec)
  const orderedRows = ensureSequentialMixScriptRows(rows, total)
  const slots = resolveMixMaterialSlotMapping(orderedRows.length, materials, materialSlots)
  const segments: IceMixSegmentPlan[] = []
  const usedIn = new Map<number, number>()

  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i]!
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    let timelineStart: number
    let timelineEnd: number
    if (tr) {
      timelineStart = tr.start
      timelineEnd = Math.min(total, tr.end)
    } else {
      timelineStart = (i * total) / orderedRows.length
      timelineEnd = Math.min(total, ((i + 1) * total) / orderedRows.length)
    }
    if (timelineEnd <= timelineStart) continue

    const matIdx = slots[i]! % materials.length
    const mat = materials[matIdx]
    if (!mat) continue

    const clipDur = timelineEnd - timelineStart
    const est =
      profileAt(materialProfiles, materials, matIdx).estimatedDurationSec ??
      MIX_DEFAULT_SOURCE_DURATION_SEC

    let sourceInSec = 0
    if (mat.kind === 'video') {
      sourceInSec = inferSourceInSec(row.visual, est, i)
      const prev = usedIn.get(matIdx)
      if (prev != null && Math.abs(sourceInSec - prev) < 1.25) {
        sourceInSec = clampMixSourceInSec(sourceInSec + 1.6, clipDur, est)
      }
      sourceInSec = clampMixSourceInSec(sourceInSec, clipDur, est)
      usedIn.set(matIdx, sourceInSec)
    }

    segments.push({
      kind: mat.kind,
      mediaUrl: sanitizeIceMixMaterialUrlForPipeline(mat.mediaUrl || mat.signedMediaUrl || ''),
      signedMediaUrl: mat.signedMediaUrl,
      materialIndex: matIdx,
      timelineStartSec: timelineStart,
      timelineEndSec: timelineEnd,
      sourceInSec,
      sourceOutSec: mat.kind === 'video' ? sourceInSec + clipDur : undefined,
      caption: row.dialogue.trim() || undefined,
    })
  }
  return segments
}

async function refineVideoSourceInWithVision(
  segments: IceMixSegmentPlan[],
  rows: ShortVideoScriptRow[],
  materials: IceMixMaterialSlot[],
  profiles: IceMixMaterialProfile[] | undefined,
  guidance: string,
): Promise<void> {
  const videoSegs = segments.filter((s) => s.kind === 'video')
  if (videoSegs.length < 1 || materials.length < 1) return

  const frames = await collectMixMaterialFramesForEditPlan(materials, {
    maxFrames: Math.min(8, materials.length),
  })
  if (frames.length < 1) return

  const storyboard = rows
    .map((r, i) => {
      const seg = segments[i]
      const mi = seg?.materialIndex ?? i % materials.length
      return `段${i}→素材${mi} | 画面：${r.visual || '（待填）'}`
    })
    .join('\n')
  const frameLegend = frames.map((f, i) => `附图${i + 1}=素材${f.index}`).join('\n')

  const system = `你是短视频剪辑师。用户已固定每段使用哪条素材（materialIndex 不可改）。
只输出 JSON 数组，为每段视频建议 sourceInSec（从源片第几秒起剪，0–8）：
[{"segmentIndex":0,"sourceInSec":1.2},...]
禁止修改 materialIndex。`

  const user = `【指导】${guidance.slice(0, 400)}\n【分镜】\n${storyboard}\n【附图】\n${frameLegend}`

  for (const provider of ['qwen', 'doubao'] as const) {
    try {
      const res = await postAiChat({
        provider,
        temperature: 0.1,
        imageDataUrls: frames.map((f) => f.dataUrl).slice(0, 8),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })
      const m = res.content?.match(/\[[\s\S]*\]/)
      if (!m) continue
      const arr = JSON.parse(m[0]) as Array<{ segmentIndex?: number; sourceInSec?: number }>
      for (const item of arr) {
        const idx = Number(item.segmentIndex)
        const inSec = Number(item.sourceInSec)
        if (!Number.isFinite(idx) || idx < 0 || idx >= segments.length) continue
        if (!Number.isFinite(inSec) || inSec < 0) continue
        const seg = segments[idx]!
        if (seg.kind !== 'video') continue
        const clipDur = seg.timelineEndSec - seg.timelineStartSec
        const est =
          profileAt(profiles, materials, seg.materialIndex).estimatedDurationSec ??
          MIX_DEFAULT_SOURCE_DURATION_SEC
        seg.sourceInSec = clampMixSourceInSec(inSec, clipDur, est)
        seg.sourceOutSec = seg.sourceInSec + clipDur
      }
      return
    } catch {
      /* next provider */
    }
  }
}

/** 写入 ICE 可解析的剪辑指令：转场、淡入淡出、动效字幕、TTS */
export function composeMixProductionBrief(
  instruction: string,
  rows: ShortVideoScriptRow[],
  opts?: { hasNarration?: boolean },
): string {
  const base = String(instruction || '').trim()
  const productionHints = [
    '多素材按分镜时间轴拼接剪辑（非单条播完切换）',
    '段间叠化转场 + 镜头淡入淡出',
    '原素材静音，使用 ICE AI_TTS 口播讲解',
    '字幕带弹入/打字机等动效，与口播同步',
  ]
  if (opts?.hasNarration) productionHints.push('口播与字幕时间轴对齐')
  const instBlock = [
    ...productionHints,
    base.length >= 4 ? base : '探店种草短视频，节奏紧凑、画面切换自然',
  ].join('；')
  return composeMixEditBrief(instBlock, rows)
}

export function validateMixSegmentDiversity(
  segments: IceMixSegmentPlan[],
  materials: IceMixMaterialSlot[],
): string | null {
  if (segments.length < 2) return '分镜至少 2 段'
  if (materials.length < 2) return null
  const matKeys = segments.map((s) => {
    const mat = materials[s.materialIndex] ?? materials[0]!
    return canonicalMixMediaKey(mat.mediaUrl || mat.signedMediaUrl || '')
  })
  if (new Set(matKeys).size < 2) {
    return '须使用至少 2 条不同素材；请上传多条视频/图片或检查素材映射'
  }
  const ins = segments
    .filter((s) => s.kind === 'video')
    .map((s) => Math.round((s.sourceInSec ?? 0) * 10) / 10)
  if (ins.length >= 2 && new Set(ins).size < 2 && new Set(matKeys).size < 2) {
    return '视频截取点过于集中，请调整分镜或素材'
  }
  return null
}

export async function produceIceMixPackage(
  input: IceMixProduceInput,
): Promise<{ ok: true; output: IceMixProduceOutput } | { ok: false; message: string }> {
  const materials = input.materials
  if (materials.length === 0) return { ok: false, message: '无可用素材' }
  if (input.rows.length < 2) return { ok: false, message: '分镜至少 2 段' }

  for (let mi = 0; mi < materials.length; mi++) {
    const mat = materials[mi]!
    const urlErr = validateIceMixMaterialUrl(mat.mediaUrl || mat.signedMediaUrl || '')
    if (urlErr) {
      return {
        ok: false,
        message: `素材${mi + 1}（${mat.label}）不可用：${urlErr}`,
      }
    }
  }

  input.onProgress?.('正在规划多素材拼接与截取点…')
  const total = resolveMixTotalDurationSec(input.rows, input.targetTotalSec)
  const rows = ensureSequentialMixScriptRows(input.rows, total)
  const materialSlots = resolveMixMaterialSlotMapping(
    rows.length,
    materials,
    input.materialSlots,
  )

  let segments = buildIceMixSegmentsFromSlots(
    rows,
    materials,
    materialSlots,
    input.targetTotalSec,
    input.materialProfiles,
  )
  if (segments.length < 2) {
    return { ok: false, message: '无法生成分镜时间线，请检查分镜表' }
  }

  try {
    input.onProgress?.('视觉 AI 优化各段截取位置…')
    await Promise.race([
      refineVideoSourceInWithVision(
        segments,
        rows,
        materials,
        input.materialProfiles,
        input.guidance || input.mixInstruction || '',
      ),
      new Promise<void>((r) => {
        const t = typeof globalThis !== 'undefined' && 'setTimeout' in globalThis ? globalThis.setTimeout : setTimeout
        t(r, VISION_SOURCE_IN_TIMEOUT_MS)
      }),
    ])
  } catch {
    /* keep structural sourceIn */
  }

  const diversityErr = validateMixSegmentDiversity(segments, materials)
  if (diversityErr && materials.length >= 2) {
    segments = buildIceMixSegmentsFromSlots(
      rows,
      materials,
      assignMixMaterialSlots(rows.length, materials.length),
      input.targetTotalSec,
      input.materialProfiles,
    )
    const retryErr = validateMixSegmentDiversity(segments, materials)
    if (retryErr) return { ok: false, message: retryErr }
  }

  const narrationText = collectMixNarrationText(rows)
  const editBrief = composeMixProductionBrief(
    input.mixInstruction || input.guidance || '',
    rows,
    { hasNarration: narrationText.length >= 4 },
  )

  const summary = segments
    .map(
      (s, i) =>
        `段${i + 1}→素材${s.materialIndex + 1}@${(s.sourceInSec ?? 0).toFixed(1)}s`,
    )
    .join(' · ')

  return {
    ok: true,
    output: {
      segments,
      editBrief,
      narrationText,
      effectId: input.effectId,
      subtitleStyleId: input.subtitleStyleId,
      materialSlots: segments.map((s) => s.materialIndex),
      summary,
    },
  }
}
