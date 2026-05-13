import OpenAI from 'openai'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { registryEntry } from '../../../src/services/ai/modelRegistry.js'

/** 纯文本消息映射（与历史稳定版本一致）；截图等多模态仅走 TokenMix。 */
function toMessages(messages: AIChatRequest['messages']): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'user', content: `[tool]\n${m.content}` }
    if (m.role === 'system') return { role: 'system', content: m.content }
    if (m.role === 'assistant') return { role: 'assistant', content: m.content }
    return { role: 'user', content: m.content }
  })
}

/**
 * MiniMax OpenAI 兼容 Chat Completions。
 * @see https://platform.minimax.io/docs/api-reference/text-chat-openai
 */
export async function chatMinimax(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const apiKey = (env.MINIMAX_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('MINIMAX_API_KEY 未配置')
  const reg = registryEntry('minimax')
  const model = (req.model ?? env.MINIMAX_MODEL ?? reg?.defaultModel ?? 'MiniMax-M2').trim()
  const baseURL = (env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1').trim().replace(/\/$/, '')
  const client = new OpenAI({ apiKey, baseURL: `${baseURL}/` })
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: toMessages(req.messages),
      temperature: req.temperature ?? 0.6,
    })
    const msg = completion.choices[0]?.message?.content
    return {
      provider: 'minimax',
      model: completion.model ?? model,
      content: typeof msg === 'string' ? msg : '',
      raw: completion as unknown as Record<string, unknown>,
      usage: completion.usage as unknown as Record<string, unknown>,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`MiniMax: ${msg}`)
  }
}
