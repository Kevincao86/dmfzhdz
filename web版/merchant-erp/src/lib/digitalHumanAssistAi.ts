/**
 * 数字人口播 · 口播/动作 AI：走商品 assist 网关 + 内置厂商 failover（与 Brief/运营文案同源）。
 */
import {
  postDouyinGoodsAiAssist,
  type AiModelId,
} from '../services/douyinAiAssistApi'
import { resolveTextAiModelForRequest } from '../services/merchantAiModelStorage'

export async function postDigitalHumanAssistText(
  userPrompt: string,
  opts?: { model?: AiModelId },
): Promise<{ ok: true; text: string; vendorUsed?: string } | { ok: false; message: string }> {
  const prompt = String(userPrompt ?? '').trim()
  if (prompt.length < 8) {
    return { ok: false, message: '提示过短，请补充口播或动作上下文' }
  }
  const model = (opts?.model ?? resolveTextAiModelForRequest()) as AiModelId
  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'digital_human_text',
    product_name: '数字人口播',
    title_draft: prompt,
  })
  if (!r.ok) return { ok: false, message: r.message }
  const text = String(r.description ?? '').trim()
  if (!text) return { ok: false, message: 'AI 未返回有效内容，请检查模型配置或稍后重试' }
  return { ok: true, text, vendorUsed: r.ai_vendor_used }
}

function dhDurationSec(raw: number | undefined, fallback = 15): number {
  const n = Math.round(Number(raw))
  if (n === 30 || n === 45 || n === 60) return n
  if (n === 15) return 15
  return fallback
}

export function buildDhScriptGeneratePrompt(topic: string, durationSec?: number): string {
  const sec = durationSec ? dhDurationSec(durationSec) : 0
  const lengthLine = sec
    ? `成片时长 ${sec} 秒，正文约 ${sec * 4} 字（允许上下浮动 15%），不要明显超长或过短。`
    : '请写一段 150～280 字的口播文案。'
  return `你是本地生活商家口播脚本助手。主题：${topic.trim()}。${lengthLine}口语化、适合短视频，可分 2～4 段，不要标题和 markdown。可在段间用空行分隔。`
}

export function buildDhScriptRewritePrompt(original: string, durationSec?: number): string {
  const sec = dhDurationSec(durationSec)
  const chars = sec * 4
  return `你是本地生活短视频口播改写助手。请根据以下原文案改写一版新的口播正文，供数字人朗读。

要求：
1. 保留原文核心卖点、产品/门店信息与事实，不编造
2. 口语化，节奏适合数字人口播
3. 成片时长 ${sec} 秒，正文精简到约 ${chars} 字（允许上下浮动 15%）。原文更长时必须删减，不要按原文长度照搬
4. 可分 2～4 段，段间可用空行
5. 不要标题、markdown、话题标签、括号说明
6. 只输出改写后的口播正文

原文案：
${original.trim().slice(0, 1800)}`
}

export function buildDhMotionRewritePrompt(
  script: string,
  motionInstructions: string,
  durationSec?: number,
): string {
  const sec = dhDurationSec(durationSec)
  const lineCount = Math.max(3, Math.min(8, Math.round(sec / 5)))
  return `你是数字人口播导演。请根据口播文案与现有动作指令，改写一版可执行的动作/镜头/表情时间轴。

要求：
1. 与口播节奏、手势、表情对应，不编造与文案无关的动作
2. 按时间轴输出，每行一条，格式如 [0-3s] 半身镜头微笑点头
3. 时间轴从 0 秒覆盖到约 ${sec} 秒，约 ${lineCount} 条，最后一条必须落在 ${sec} 秒以内
4. 不要按原文动作条数照搬；原文更长时合并、删减
5. 不要 markdown、标题、JSON，只输出动作指令正文

口播文案：
${script.trim().slice(0, 1800)}

现有动作指令：
${motionInstructions.trim().slice(0, 1200)}`
}

/** 抖音提取后：口播和动作一起收到所选成片时长。 */
export function buildDhExtractFitPrompt(
  script: string,
  motionInstructions: string,
  durationSec?: number,
): string {
  const sec = dhDurationSec(durationSec)
  const chars = sec * 4
  const lineCount = Math.max(3, Math.min(8, Math.round(sec / 5)))
  return `你是数字人口播剪辑。下面是从抖音视频提取的口播和动作。请按成片时长 ${sec} 秒精简，供数字人朗读。

要求：
1. 保留原视频里的卖点、店名、价格、菜品等事实，不编造
2. 口播正文约 ${chars} 字（允许上下浮动 15%）。原文更长必须删减，更短可轻微补口语衔接，不要注水
3. 动作时间轴从 0 秒覆盖到约 ${sec} 秒，约 ${lineCount} 条，每行一条，格式如 [0-3s] 半身镜头微笑点头，最后一条不超过 ${sec} 秒
4. 不要标题、markdown、话题标签

请严格按下面两段输出，不要其它说明：
口播：
（精简后的口播正文）
动作：
（时间轴，每行一条）

提取的口播：
${script.trim().slice(0, 1800)}

提取的动作：
${motionInstructions.trim().slice(0, 1200)}`
}

export function parseDhExtractFitOutput(text: string): { script: string; motion: string } | null {
  const raw = String(text || '').trim()
  const mark = raw.search(/(?:^|\n)\s*动作(?:指令)?[：:]/)
  if (mark < 0) return null
  const script = raw
    .slice(0, mark)
    .replace(/^\s*口播(?:文案)?[：:]\s*/, '')
    .trim()
  const motion = raw
    .slice(mark)
    .replace(/^\s*动作(?:指令)?[：:]\s*/, '')
    .trim()
  if (script.length < 8 || motion.length < 4) return null
  return { script, motion }
}
