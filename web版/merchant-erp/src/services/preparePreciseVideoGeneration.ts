/**
 * 生成前统一门禁：Brief → 增强 →（可选）长片规划 → 填满+意图保真。
 */

import {
  buildBriefFromInput,
  enrichGuidanceFromBrief,
  formatMissingSlotsMessage,
  validateBriefFidelity,
  type ShortVideoGenBrief,
  type VideoStyleAdapterHint,
} from '../lib/shortVideoGenBrief'
import {
  findShortVideoSkill,
  type ShortVideoSkillId,
} from '../lib/shortVideoSkills'
import {
  scriptRowsFromVideoPrompts,
  validateStoryboardRows,
  type ShortVideoScriptRow,
} from '../lib/shortVideoScriptTable'
import {
  optimizeShortVideoGuidancePrompt,
  planShortVideoScriptFromGuidance,
} from './shortVideoGuidanceAi'
import type { LongformPlanMode } from './videoAiApi'

export type PreparePreciseVideoGenerationInput = {
  rawPrompt: string
  skillId?: ShortVideoSkillId | string | null
  targetTotalSec: number
  segmentSec?: number
  longform?: boolean
  hasProductImage?: boolean
  frameMode?: boolean
  /** 已有画布分镜：跳过规划，只做保真 */
  existingRows?: ShortVideoScriptRow[] | null
  /** 是否调用语言模型优化执导文案（默认 true；已有完整分镜时可 false） */
  optimizeGuidance?: boolean
  plannerModel?: 'doubao' | 'qwen' | 'auto'
  mode?: LongformPlanMode
  onProgress?: (message: string) => void
  /** 阶段 D LoRA；本轮仅带回 */
  adapterHint?: VideoStyleAdapterHint
}

export type PreparePreciseVideoGenerationResult =
  | {
      ok: true
      guidance: string
      rows: ShortVideoScriptRow[] | null
      segmentPrompts: string[]
      brief: ShortVideoGenBrief
      adapterHint?: VideoStyleAdapterHint
      usedLongformPlan: boolean
    }
  | { ok: false; message: string; brief: ShortVideoGenBrief; issues: string[] }

const LONGFORM_SEC_THRESHOLD = 15

export async function preparePreciseVideoGeneration(
  input: PreparePreciseVideoGenerationInput,
): Promise<PreparePreciseVideoGenerationResult> {
  const skill = findShortVideoSkill(input.skillId)
  const brief = buildBriefFromInput(input.rawPrompt, skill)
  if (input.adapterHint) brief.adapterHint = input.adapterHint

  if (brief.missingSlots.length > 0) {
    const msg = formatMissingSlotsMessage(brief)
    return { ok: false, message: msg, brief, issues: [msg] }
  }

  if (brief.raw.trim().length < 8) {
    const msg = '请先输入执导文案或选择 Skill 并补充商家信息'
    return { ok: false, message: msg, brief, issues: [msg] }
  }

  let guidance = enrichGuidanceFromBrief(brief)
  const wantOptimize = input.optimizeGuidance !== false
  if (wantOptimize && !(input.existingRows && input.existingRows.length >= 2)) {
    input.onProgress?.('正在优化执导文案…')
    const opt = await optimizeShortVideoGuidancePrompt(guidance, {
      hasProductImage: input.hasProductImage,
      frameMode: input.frameMode,
    })
    if (opt.ok) {
      // 优化结果再叠 Brief 约束，防模型丢掉 mustInclude
      guidance = enrichGuidanceFromBrief({ ...brief, raw: opt.text })
    }
  }

  const useLongform =
    Boolean(input.longform) ||
    input.targetTotalSec >= LONGFORM_SEC_THRESHOLD ||
    (input.existingRows != null && input.existingRows.length >= 2)

  let rows: ShortVideoScriptRow[] | null =
    input.existingRows && input.existingRows.length >= 2 ? [...input.existingRows] : null
  let usedLongformPlan = false

  if (useLongform) {
    if (!rows) {
      input.onProgress?.('正在规划分镜并校验意图…')
      const plan = await planShortVideoScriptFromGuidance(guidance, {
        targetTotalSec: input.targetTotalSec,
        segmentSec: input.segmentSec ?? 5,
        plannerModel: input.plannerModel ?? 'auto',
        mode: input.mode ?? (input.frameMode ? 'generate_frames' : 'generate_text'),
        hasProductImage: input.hasProductImage,
        frameMode: input.frameMode,
        onProgress: input.onProgress,
      })
      if (!plan.ok) {
        return {
          ok: false,
          message: plan.message,
          brief,
          issues: [plan.message],
        }
      }
      rows = plan.rows
      usedLongformPlan = true
    }

    const fill = validateStoryboardRows(rows, input.targetTotalSec)
    if (!fill.ok) {
      return {
        ok: false,
        message: `分镜未通过：${fill.issues.join('；')}`,
        brief,
        issues: fill.issues,
      }
    }

    const fidelity = validateBriefFidelity(brief, { rows, skill })
    if (!fidelity.ok) {
      // 与单段一致：分镜已填且文案够长时，结构节拍关键词不再硬拦（SaaS/产品演示常无「到店/菜品」词）
      const corpusLen = rows.reduce(
        (n, r) => n + String(r.visual || '').length + String(r.dialogue || '').length,
        0,
      )
      const hard = fidelity.issues.filter(
        (x) => !x.startsWith('结构节拍缺失') || corpusLen < 80,
      )
      if (hard.length > 0) {
        return {
          ok: false,
          message: hard.join('；'),
          brief,
          issues: hard,
        }
      }
    }

    const segmentPrompts = rows.map((r) => {
      const vis = r.visual.trim()
      const dia = r.dialogue.trim()
      return [vis, dia ? `口播：${dia}` : ''].filter(Boolean).join('\n')
    })

    return {
      ok: true,
      guidance,
      rows,
      segmentPrompts,
      brief,
      adapterHint: brief.adapterHint,
      usedLongformPlan,
    }
  }

  // 单段短片
  const fidelity = validateBriefFidelity(brief, { prompt: guidance, skill })
  if (!fidelity.ok) {
    // 单段对「结构节拍」过严时：若 mustInclude 已写入 guidance 且文案够长，仅保留 mustInclude/缺槽类问题
    const soft = fidelity.issues.filter(
      (x) => !x.startsWith('结构节拍缺失') || guidance.length < 80,
    )
    if (soft.length > 0 && soft.some((x) => x.includes('意图保真') || x.includes('补全') || x.includes('过短'))) {
      return { ok: false, message: soft.join('；'), brief, issues: soft }
    }
    if (soft.length > 0 && guidance.length < 40) {
      return { ok: false, message: soft.join('；'), brief, issues: soft }
    }
  }

  return {
    ok: true,
    guidance,
    rows: null,
    segmentPrompts: [guidance],
    brief,
    adapterHint: brief.adapterHint,
    usedLongformPlan: false,
  }
}

/** 将规划 prompts 与已有分镜对齐（无 rows 时用） */
export function rowsFromSegmentPrompts(
  prompts: string[],
  segmentSec: number,
): ShortVideoScriptRow[] {
  return scriptRowsFromVideoPrompts(prompts, segmentSec)
}
