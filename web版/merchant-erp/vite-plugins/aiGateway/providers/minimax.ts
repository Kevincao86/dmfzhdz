import OpenAI from 'openai'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { registryEntry } from '../../../src/services/ai/modelRegistry.js'
import { toOpenAiChatCompletionMessages } from '../openAiChatMessages.js'

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
      messages: toOpenAiChatCompletionMessages(req),
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
