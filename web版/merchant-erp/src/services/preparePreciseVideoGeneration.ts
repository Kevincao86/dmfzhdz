/**
 * 生成前统一门禁：Brief → 增强 →（可选）长片规划 → 填满分镜。
 * 意图保真（mustInclude 字面命中）只作约束注入，不硬拦出片。
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
  isScriptRowsUsable,
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

/** 超过单段 Seedance 上限才走长片分镜规划；=15 仍是单次出片 */
const LONGFORM_SEC_THRESHOLD = 15

function singleShotResult(
  guidance: string,
  brief: ShortVideoGenBrief,
): Extract<PreparePreciseVideoGenerationResult, { ok: true }> {
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

function allowSingleShotFallback(input: PreparePreciseVideoGenerationInput): boolean {
  return !input.longform && input.targetTotalSec <= LONGFORM_SEC_THRESHOLD
}

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
  const existingUsable =
    input.existingRows != null &&
    input.existingRows.length >= 2 &&
    isScriptRowsUsable(input.existingRows)
  const wantOptimize = input.optimizeGuidance !== false
  if (wantOptimize && !existingUsable) {
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

  // 仅「明确长片 / 超过 15s / 已有可用分镜」走分段规划。
  // 旧逻辑用 >=15，导致默认 15 秒单段也先调规划模型，失败时主按钮像点了没反应。
  const useLongform =
    Boolean(input.longform) ||
    input.targetTotalSec > LONGFORM_SEC_THRESHOLD ||
    existingUsable

  let rows: ShortVideoScriptRow[] | null = existingUsable ? [...input.existingRows!] : null
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
        if (allowSingleShotFallback(input)) {
          input.onProgress?.('分镜规划暂不可用，改为单段直接出片…')
          return singleShotResult(guidance, brief)
        }
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
      if (allowSingleShotFallback(input)) {
        input.onProgress?.('分镜未填满，改为单段直接出片…')
        return singleShotResult(guidance, brief)
      }
      return {
        ok: false,
        message: `分镜未通过：${fill.issues.join('；')}`,
        brief,
        issues: fill.issues,
      }
    }

    const fidelity = validateBriefFidelity(brief, { rows, skill })
    if (!fidelity.ok) {
      // 结构节拍 / 意图保真（mustInclude 字面命中）均不硬拦：约束已写入 guidance，可继续出片。
      const corpusLen = rows.reduce(
        (n, r) => n + String(r.visual || '').length + String(r.dialogue || '').length,
        0,
      )
      const storyboardReady = isScriptRowsUsable(rows)
      const hard = fidelity.issues.filter((x) => {
        if (x.includes('意图保真')) return false
        if (x.startsWith('结构节拍缺失')) return !storyboardReady && corpusLen < 80
        return true
      })
      if (hard.length > 0) {
        if (allowSingleShotFallback(input)) {
          input.onProgress?.('分镜保真未过，改为单段直接出片…')
          return singleShotResult(guidance, brief)
        }
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

  // 单段短片：意图保真不硬拦；仅拦文案过短 / 缺槽补全
  const fidelity = validateBriefFidelity(brief, { prompt: guidance, skill })
  if (!fidelity.ok) {
    const blocking = fidelity.issues.filter(
      (x) =>
        !x.includes('意图保真') &&
        !x.startsWith('结构节拍缺失') &&
        (x.includes('补全') || x.includes('过短')),
    )
    if (blocking.length > 0) {
      return { ok: false, message: blocking.join('；'), brief, issues: blocking }
    }
    if (guidance.length < 40) {
      const shortIssues = fidelity.issues.filter((x) => !x.includes('意图保真') && !x.startsWith('结构节拍缺失'))
      if (shortIssues.length > 0) {
        return { ok: false, message: shortIssues.join('；'), brief, issues: shortIssues }
      }
    }
  }

  return singleShotResult(guidance, brief)
}

/** 将规划 prompts 与已有分镜对齐（无 rows 时用） */
export function rowsFromSegmentPrompts(
  prompts: string[],
  segmentSec: number,
): ShortVideoScriptRow[] {
  return scriptRowsFromVideoPrompts(prompts, segmentSec)
}
