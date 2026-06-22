import { postAiChat } from './ai/aiClient'
import {
  postLongformVideoPlan,
  type LongformPlanMode,
} from './videoAiApi'
import {
  resizeScriptRows,
  scriptRowsFromVideoPrompts,
  parseScriptRowsFromPlainText,
  isScriptRowsUsable,
  scriptRowsHaveExplicitTimeRanges,
  mergeScriptRowTimeRanges,
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
    ? '用户会上传「重点产品图」作图生视频参考；请在文案中安排 1–2 个产品特写镜头（主体居中、轮廓清晰、包装细节可辨）。'
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
  return '【产品呈现】镜头转到产品时使用上传的重点产品参考图，主体占画面中心，轮廓与包装细节清晰可辨，柔光突出质感，避免模糊与遮挡。'
}

/**
 * 根据指导文案调用长片策划，自动拆成时间段 / 画面 / 口播分镜表行。
 */
export async function planShortVideoScriptFromGuidance(
  guidance: string,
  opts: {
    segmentCount: number
    segmentSec: number
    plannerModel: 'doubao' | 'qwen'
    mode: LongformPlanMode
    hasProductImage?: boolean
    frameMode?: boolean
  },
): Promise<{ ok: true; rows: ShortVideoScriptRow[] } | { ok: false; message: string }> {
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
  const hasEmbeddedTimes =
    embeddedRows.length >= 2 && scriptRowsHaveExplicitTimeRanges(embeddedRows)
  const segmentCount = hasEmbeddedTimes ? embeddedRows.length : opts.segmentCount

  if (hasEmbeddedTimes && isScriptRowsUsable(embeddedRows)) {
    return { ok: true, rows: embeddedRows }
  }

  const scriptSegments = hasEmbeddedTimes
    ? embeddedRows.map((r) => ({
        timeRange: r.timeRange,
        visual: r.visual,
        dialogue: r.dialogue,
      }))
    : undefined

  const plan = await postLongformVideoPlan({
    plannerModel: opts.plannerModel,
    overallPrompt,
    segmentCount,
    segmentSec: opts.segmentSec,
    mode: opts.mode,
    scriptSegments,
  })
  if (!plan.ok) return plan

  let rows: ShortVideoScriptRow[] = []
  if (plan.scriptSegments && plan.scriptSegments.length >= 2) {
    rows = plan.scriptSegments.map((s) => ({
      timeRange: String(s.timeRange ?? '').trim(),
      visual: String(s.visual ?? '').trim(),
      dialogue: String(s.dialogue ?? '').trim(),
    }))
  } else if (plan.prompts.length >= 2) {
    rows = scriptRowsFromVideoPrompts(plan.prompts, opts.segmentSec)
  }

  if (rows.length < 2) {
    return {
      ok: false,
      message: 'AI 未返回可用分镜，请补充指导文案或更换策划模型后重试',
    }
  }

  if (hasEmbeddedTimes) {
    rows = mergeScriptRowTimeRanges(rows, embeddedRows)
  }

  return {
    ok: true,
    rows: resizeScriptRows(rows, segmentCount, opts.segmentSec),
  }
}
