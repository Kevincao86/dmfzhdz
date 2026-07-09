import { postAiChat } from './ai/aiClient'
import { shortVideoProductPlannerHint } from '../lib/shortVideoProductFocus'
import {
  postLongformVideoPlan,
  type LongformPlanMode,
} from './videoAiApi'
import {
  scriptRowsFromVideoPrompts,
  parseScriptRowsFromPlainText,
  scriptRowsHaveExplicitTimeRanges,
  mergeScriptRowTimeRanges,
  inferScriptSegmentCountFromText,
  effectiveScriptRowCount,
  segmentCountFromTargetTotalSec,
  resolveLongformPlannerParams,
  maxScriptTimeRangeEndSec,
  finalizePlannedScriptRows,
  validateStoryboardRows,
  scriptRowsFullyFilled,
  type ShortVideoScriptRow,
} from '../lib/shortVideoScriptTable'

/** 豆包失败后是否再试通义千问（文案优化等非代码场景） */
function shouldFallbackToQwenAfterDoubao(message: string): boolean {
  const msg = String(message || '').trim()
  if (!msg) return true
  if (/请先输入|未返回优化结果/i.test(msg)) return false
  if (/未配置.*API Key/i.test(msg) && !/upstream_error/i.test(msg)) return false
  return true
}

function buildGuidanceOptimizeSystem(productHint: string, modeHint: string): string {
  return `你是短视频编导，负责把商家的粗糙想法改写成 AI 视频模型可执行的「执导文案」（中文）。
要求：
- 保留用户原意、商品/场景/卖点，勿编造未提及的店名或价格
- 约 120–280 字，可写镜头运动、光线、节奏、人物动作与氛围
- 语言具体、可画面化；${modeHint}
- ${productHint || '若涉及商品，可建议特写呈现方式。'}
- 区分口播内容与画面/动作指导；口播用自然口语，画面与运镜单独描述
- 不要写 AI 生成技巧、上传参考图步骤、总时长、画幅比例、帧率、BGM 等技术参数（由界面选项控制）
- 不要要求在画面内出现字幕、标题、Logo 文字或任何可读文字（字幕由后期烧录）
- 只输出执导正文，不要 markdown、不要列表编号、不要引号包裹全文`
}

async function optimizeGuidanceWithProvider(
  draft: string,
  provider: 'doubao' | 'qwen',
  system: string,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  try {
    const res = await postAiChat({
      provider,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: draft },
      ],
      temperature: 0.65,
    })
    const text = res.content?.trim()
    if (!text) return { ok: false, message: 'AI 未返回优化结果，请稍后重试' }
    return { ok: true, text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg || 'AI 优化失败' }
  }
}

/**
 * 执导文案优化：服务端豆包/千问语言模型池内 failover + 前端豆包↔千问跨厂商互备（与分镜策划、视频生成互备一致）。
 */
export async function optimizeShortVideoGuidancePrompt(
  raw: string,
  opts?: { hasProductImage?: boolean; frameMode?: boolean },
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const draft = raw.trim()
  if (draft.length < 4) {
    return { ok: false, message: '请先输入几个字或上传文档后再优化' }
  }

  const productHint = opts?.hasProductImage
    ? '用户会上传「重点产品图」：请在文案/分镜中安排 1 段中后段产品特写（标注产品特写/包装展示），开场勿抢产品画面。'
    : ''
  const modeHint = opts?.frameMode
    ? '用户另有分镜参考图，执导文案须与多镜头顺序一致。'
    : '输出适合单条 AI 短片的一次性执导描述。'
  const system = buildGuidanceOptimizeSystem(productHint, modeHint)

  const vendors: ('doubao' | 'qwen')[] = ['doubao', 'qwen']
  const tried: string[] = []
  let lastMsg = ''

  for (const vendor of vendors) {
    const r = await optimizeGuidanceWithProvider(draft, vendor, system)
    if (r.ok) return r
    lastMsg = r.message
    tried.push(vendor === 'doubao' ? '豆包语言模型池' : '通义千问语言模型池')
    if (vendor === 'doubao' && shouldFallbackToQwenAfterDoubao(lastMsg)) continue
    break
  }

  if (tried.length > 1) {
    return {
      ok: false,
      message: `${lastMsg}（已依次尝试 ${tried.join(' → ')}）`,
    }
  }
  return { ok: false, message: lastMsg }
}

export function productFocusPromptSuffix(): string {
  return shortVideoProductPlannerHint()
}

/** 包装输入框原文，强制模型先通读再规划 */
export function wrapLongformPlannerInput(raw: string, targetTotalSec: number): string {
  const body = raw.trim()
  const charCount = [...body].length
  const durationNote = targetTotalSec >= 10 ? `目标成片总时长 ${targetTotalSec} 秒。` : ''
  return `【强制阅读 · 第一步】以下为商家在输入框内提供的指导文案原文（共 ${charCount} 字）。${durationNote}你必须完整通读全文（含 Markdown 表格、分镜时间段、剪辑备注、旁白/字幕规范），理解全部卖点与镜头意图后，再进入第二步输出 segments JSON；禁止只扫前几行或个别时间段示例就停止规划。

--- 指导文案原文开始 ---
${body}
--- 指导文案原文结束 ---`
}

export type ShortVideoScriptPlanMeta = {
  usedAiPlanner?: boolean
  usedRuleBasedFallback?: boolean
  plannerVendor?: string
  plannerModelId?: string
  reviewVendors?: string[]
}

type PlanApiRow = {
  timeRange?: string
  visual?: string
  dialogue?: string
  prompt?: string
  action?: string
  narration?: string
  voiceover?: string
}

function rowsFromPlanSegments(segments: PlanApiRow[] | undefined): ShortVideoScriptRow[] {
  if (!segments?.length) return []
  return segments.map((s) => {
    const prompt = String(s.prompt ?? '').trim()
    const action = String(s.action ?? '').trim()
    const visual =
      String(s.visual ?? '').trim() || [prompt, action].filter(Boolean).join('；')
    const dialogue = String(
      s.dialogue ?? s.narration ?? s.voiceover ?? '',
    ).trim()
    return {
      timeRange: String(s.timeRange ?? '').trim(),
      visual,
      dialogue,
    }
  })
}

function mergePlanRowsWithPrompts(
  rows: ShortVideoScriptRow[],
  prompts: string[],
  segmentSec: number,
): ShortVideoScriptRow[] {
  if (prompts.length < 2) return rows
  const fromPrompts = scriptRowsFromVideoPrompts(prompts, segmentSec)
  if (rows.length < 2) return fromPrompts
  return rows.map((r, i) => {
    const fb = fromPrompts[i] ?? fromPrompts[fromPrompts.length - 1]!
    return {
      timeRange: r.timeRange.trim() || fb.timeRange,
      visual: r.visual.trim() || fb.visual,
      dialogue: r.dialogue.trim() || fb.dialogue,
    }
  })
}

function applyPlanResponseRows(
  scriptSegments: PlanApiRow[] | undefined,
  prompts: string[],
  segmentSec: number,
): ShortVideoScriptRow[] {
  let rows = rowsFromPlanSegments(scriptSegments)
  if (prompts.length >= 2) {
    rows = mergePlanRowsWithPrompts(rows, prompts, segmentSec)
  }
  return rows
}

function segmentsPayload(rows: ShortVideoScriptRow[]) {
  return rows.map((r) => ({
    timeRange: r.timeRange,
    visual: r.visual,
    dialogue: r.dialogue,
  }))
}

/**
 * 根据指导文案调用长片策划，自动拆成时间段 / 画面 / 口播分镜表行。
 * 三模型串联：模型 1 规划 → 模型 2 检查补全 → 模型 3 最终复核。
 */
export async function planShortVideoScriptFromGuidance(
  guidance: string,
  opts: {
    targetTotalSec: number
    segmentSec: number
    plannerModel?: 'doubao' | 'qwen' | 'auto'
    mode: LongformPlanMode
    hasProductImage?: boolean
    frameMode?: boolean
    /** 混剪等轻量场景：仅模型 1 规划，跳过二/三轮复核（更快、更少超时） */
    skipReviewPasses?: boolean
    onProgress?: (message: string) => void
  },
): Promise<
  | ({ ok: true; rows: ShortVideoScriptRow[]; segmentCount: number } & ShortVideoScriptPlanMeta)
  | { ok: false; message: string }
> {
  const draft = guidance.trim()
  if (draft.length < 4) {
    return { ok: false, message: '请先输入指导文案或上传文档后再规划分镜' }
  }

  let overallPrompt = draft
  if (opts.hasProductImage) {
    overallPrompt = `${overallPrompt}\n${productFocusPromptSuffix()}`
  }
  if (opts.frameMode) {
    overallPrompt = `${overallPrompt}\n（用户将上传分镜参考图，各段画面须与镜头顺序一致。）`
  }

  const embeddedRows = parseScriptRowsFromPlainText(draft)
  const planner = resolveLongformPlannerParams(
    draft,
    opts.targetTotalSec,
    opts.segmentSec,
    embeddedRows,
  )
  const hasEmbeddedTimes =
    embeddedRows.length >= 2 && scriptRowsHaveExplicitTimeRanges(embeddedRows)

  const segmentCount = planner.autoSegmentCount
    ? segmentCountFromTargetTotalSec(planner.effectiveTargetSec, 5)
    : effectiveScriptRowCount(
        embeddedRows,
        hasEmbeddedTimes
          ? embeddedRows.length
          : inferScriptSegmentCountFromText(draft) >= 2
            ? inferScriptSegmentCountFromText(draft)
            : planner.segmentCount,
      )

  const baseBody = {
    plannerModel: opts.plannerModel ?? 'auto',
    targetTotalSec: planner.effectiveTargetSec,
    segmentCount: planner.autoSegmentCount ? undefined : segmentCount,
    segmentSec: opts.segmentSec,
    mode: opts.mode,
    forceAiPlanner: true,
  }

  const plannerInput = wrapLongformPlannerInput(overallPrompt, planner.effectiveTargetSec)
  const reviewVendors: string[] = []

  opts.onProgress?.('AI 模型 1 正在通读全文并规划分镜…')
  let plan = await postLongformVideoPlan({
    ...baseBody,
    overallPrompt: plannerInput,
    planStage: 'draft',
  })
  if (!plan.ok) return plan

  let rows = applyPlanResponseRows(plan.scriptSegments, plan.prompts, opts.segmentSec)
  if (plan.plannerVendor) reviewVendors.push(plan.plannerVendor)

  if (
    planner.effectiveTargetSec >= 10 &&
    rows.length >= 2 &&
    maxScriptTimeRangeEndSec(rows) < planner.effectiveTargetSec - 2 &&
    !plan.usedRuleBasedFallback
  ) {
    const covered = maxScriptTimeRangeEndSec(rows)
    const repairPrompt = `${plannerInput}\n\n【重要纠正】上次分镜仅覆盖约 0-${covered} 秒，未完成 ${planner.effectiveTargetSec} 秒成片。请重新完整阅读上文并规划：每段画面与口播均须非空，时间段须连续覆盖至 ${planner.effectiveTargetSec} 秒。`
    plan = await postLongformVideoPlan({
      ...baseBody,
      overallPrompt: repairPrompt,
      planStage: 'draft',
    })
    if (!plan.ok) return plan
    rows = applyPlanResponseRows(plan.scriptSegments, plan.prompts, opts.segmentSec)
  }

  if (rows.length < 2) {
    return {
      ok: false,
      message: 'AI 模型 1 未返回可用分镜，请补充指导文案后重试',
    }
  }

  let validationIssues: string[] = []
  let lastValidation = validateStoryboardRows(rows, planner.effectiveTargetSec)
  validationIssues = lastValidation.issues

  let review1UsedAi = false
  let review2UsedAi = false
  let review1Vendor: string | undefined
  let review2Vendor: string | undefined
  let review1ModelId: string | undefined
  let review2ModelId: string | undefined

  if (!opts.skipReviewPasses) {
    opts.onProgress?.('AI 模型 2 正在检查并补全分镜（禁止空白段）…')
    const review1 = await postLongformVideoPlan({
      ...baseBody,
      overallPrompt: plannerInput,
      planStage: 'review',
      reviewPass: 1,
      draftSegments: segmentsPayload(rows),
      validationIssues,
    })
    if (!review1.ok) return review1
    rows = applyPlanResponseRows(review1.scriptSegments, review1.prompts, opts.segmentSec)
    if (review1.plannerVendor) reviewVendors.push(review1.plannerVendor)
    review1UsedAi = review1.usedAiPlanner === true
    review1Vendor = review1.plannerVendor
    review1ModelId = review1.plannerModelId
    lastValidation = validateStoryboardRows(rows, planner.effectiveTargetSec)
    validationIssues = lastValidation.issues

    opts.onProgress?.('AI 模型 3 正在复核分镜（时间段与文案一一对应）…')
    const review2 = await postLongformVideoPlan({
      ...baseBody,
      overallPrompt: plannerInput,
      planStage: 'review',
      reviewPass: 2,
      draftSegments: segmentsPayload(rows),
      validationIssues,
    })
    if (!review2.ok) return review2
    rows = applyPlanResponseRows(review2.scriptSegments, review2.prompts, opts.segmentSec)
    if (review2.plannerVendor) reviewVendors.push(review2.plannerVendor)
    review2UsedAi = review2.usedAiPlanner === true
    review2Vendor = review2.plannerVendor
    review2ModelId = review2.plannerModelId
  } else if (!scriptRowsFullyFilled(rows)) {
    return {
      ok: false,
      message: `AI 规划的分镜仍有空白段：${validationIssues.join('；') || '画面或口播未填满'}。请补充指导文案后重试。`,
    }
  }

  if (hasEmbeddedTimes) {
    rows = mergeScriptRowTimeRanges(rows, embeddedRows)
  }

  rows = finalizePlannedScriptRows(rows, draft, planner.effectiveTargetSec)

  const finalValidation = validateStoryboardRows(rows, planner.effectiveTargetSec)
  if (!finalValidation.ok) {
    const stageLabel = opts.skipReviewPasses ? 'AI 规划' : '三模型复核'
    return {
      ok: false,
      message: `${stageLabel}后仍有未通过项：${finalValidation.issues.join('；')}。请补充指导文案后重试。`,
    }
  }

  return {
    ok: true,
    rows,
    segmentCount: rows.length,
    usedAiPlanner: plan.usedAiPlanner || review1UsedAi || review2UsedAi,
    usedRuleBasedFallback: plan.usedRuleBasedFallback,
    plannerVendor: opts.skipReviewPasses
      ? plan.plannerVendor
      : (review2Vendor ?? review1Vendor ?? plan.plannerVendor),
    plannerModelId: opts.skipReviewPasses
      ? plan.plannerModelId
      : (review2ModelId ?? review1ModelId ?? plan.plannerModelId),
    reviewVendors,
  }
}
