import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { registryEntry } from '../../../src/services/ai/modelRegistry.js'

function toMessages(messages: AIChatRequest['messages']): { role: string; content: string }[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'user', content: `[tool]\n${m.content}` }
    return { role: m.role, content: m.content }
  })
}

/**
 * DeepSeek Chat Completions（OpenAI 兼容）；按需附加 thinking / reasoning_effort（见官方文档）。
 * 与历史稳定版本一致；截图等多模态仅走 TokenMix。
 */
export async function chatDeepseek(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const apiKey = (env.DEEPSEEK_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置')
  const reg = registryEntry('deepseek')
  const model = (req.model ?? env.DEEPSEEK_MODEL ?? reg?.defaultModel ?? 'deepseek-chat').trim()
  const base = (env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').trim().replace(/\/$/, '')

  const body: Record<string, unknown> = {
    model,
    messages: toMessages(req.messages),
    temperature: req.temperature ?? 0.6,
    ...(req.taskType
      ? { thinking: { type: 'enabled' }, reasoning_effort: 'medium' }
      : { thinking: { type: 'disabled' } }),
  }
  if (req.tools?.length) {
    body.tools = req.tools
    if (req.tool_choice != null) body.tool_choice = req.tool_choice
  }

  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const rawText = await r.text()
  let raw: Record<string, unknown> = {}
  try {
    raw = JSON.parse(rawText) as Record<string, unknown>
  } catch {
    throw new Error(rawText.slice(0, 400) || `DeepSeek HTTP ${r.status}`)
  }
  if (!r.ok) {
    const msg =
      typeof raw.error === 'object' && raw.error && typeof (raw.error as { message?: string }).message === 'string'
        ? (raw.error as { message: string }).message
        : rawText.slice(0, 400)
    throw new Error(msg || `DeepSeek HTTP ${r.status}`)
  }
  const choices = raw.choices as Array<{
    message?: {
      content?: string
      tool_calls?: AIChatResponse['tool_calls']
    }
  }> | undefined
  const message = choices?.[0]?.message
  const content = message?.content ?? ''
  const usage = raw.usage as Record<string, unknown> | undefined
  const tool_calls = message?.tool_calls
  return {
    provider: 'deepseek',
    model: typeof raw.model === 'string' ? raw.model : model,
    content: typeof content === 'string' ? content : '',
    raw,
    usage,
    ...(tool_calls?.length ? { tool_calls } : {}),
  }
}
