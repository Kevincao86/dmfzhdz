import OpenAI from 'openai'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { registryEntry } from '../../../src/services/ai/modelRegistry.js'
import { looksLikeMinimaxJwtKey } from '../../merchantRegistryVendorEnv.js'
import {
  minimaxChatBaseCandidates,
  minimaxChatModelCandidates,
  resolveMinimaxApiKey,
} from './directLlmEnv.js'

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
  const apiKey = resolveMinimaxApiKey(env)
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY 未配置（请在运营台「AI 模型」填写 MiniMax 密钥）')
  }
  if (looksLikeMinimaxJwtKey(apiKey)) {
    throw new Error(
      'MiniMax Key 形如 JWT(eyJ…)，OpenAI 兼容对话需使用平台「接口密钥」页的 sk- 开头 Key；JWT 会报 2049 invalid api key',
    )
  }
  const reg = registryEntry('minimax')
  const models = minimaxChatModelCandidates(env, req.model, reg?.defaultModel)
  const bases = minimaxChatBaseCandidates(env)
  const messages = toMessages(req.messages)
  const temperature = req.temperature ?? 1

  let lastErr: Error | null = null
  for (const baseURL of bases) {
    const client = new OpenAI({ apiKey, baseURL: `${baseURL.replace(/\/$/, '')}/` })
    for (const model of models) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          temperature,
          stream: false,
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
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
    }
  }
  throw new Error(`MiniMax: ${lastErr?.message ?? '请求失败'}`)
}
