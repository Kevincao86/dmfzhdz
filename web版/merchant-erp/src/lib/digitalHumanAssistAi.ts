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

export function buildDhScriptGeneratePrompt(topic: string): string {
  return `你是本地生活商家口播脚本助手。主题：${topic.trim()}。请写一段 150～280 字的口播文案，口语化、适合短视频，分 2～4 段，不要标题和 markdown。可在段间用空行分隔。`
}

export function buildDhScriptRewritePrompt(original: string): string {
  const len = Math.max(80, Math.min(400, original.length + 40))
  return `你是本地生活短视频口播改写助手。请根据以下原文案改写一版新的口播正文，供数字人朗读。

要求：
1. 保留原文核心卖点、产品/门店信息与事实，不编造
2. 口语化、节奏适合 30～60 秒短视频口播
3. 长度与原文接近（约 ${len} 字），可分 2～4 段，段间可用空行
4. 不要标题、markdown、话题标签、括号说明
5. 只输出改写后的口播正文

原文案：
${original.trim()}`
}

export function buildDhMotionRewritePrompt(script: string, motionInstructions: string): string {
  const lineCount = Math.max(3, Math.min(8, motionInstructions.split('\n').filter(Boolean).length + 1))
  return `你是数字人口播导演。请根据口播文案与现有动作指令，改写一版更专业、可执行的动作/镜头/表情时间轴。

要求：
1. 与口播节奏、手势、表情一一对应，不编造与文案无关的动作
2. 按时间轴输出，每行一条，格式如 [0-3s] 半身镜头微笑点头
3. 覆盖开场、中段强调、结尾引导互动
4. 长度与原文接近，约 ${lineCount} 条
5. 不要 markdown、标题、JSON，只输出动作指令正文

口播文案：
${script.trim()}

现有动作指令：
${motionInstructions.trim()}`
}
