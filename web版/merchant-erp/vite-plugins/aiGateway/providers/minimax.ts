import OpenAI from 'openai'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { assertDistinctFromTokenMix, looksLikeJwtCredential } from '../../../src/lib/aiVendorKeyValidate.js'
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

function isAuthError(err: Error | null): boolean {
  return !!err?.message?.match(/401|2049|invalid api key|invalid authentication/i)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  if (looksLikeMinimaxJwtKey(apiKey) || looksLikeJwtCredential(apiKey)) {
    throw new Error(
      'MiniMax Key 形如 JWT(eyJ…)，OpenAI 兼容对话需使用平台「接口密钥」页的 sk- 开头 Key；JWT 会报 2049 invalid api key',
    )
  }
  assertDistinctFromTokenMix('MiniMax', apiKey, env.TOKENMIX_API_KEY)
  const reg = registryEntry('minimax')
  const models = minimaxChatModelCandidates(env, req.model, reg?.defaultModel)
  const bases = minimaxChatBaseCandidates(env, apiKey)
  const messages = toMessages(req.messages)
  const temperature = req.temperature ?? 1

  const attempt = async (): Promise<AIChatResponse | null> => {
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
    if (lastErr) throw lastErr
    return null
  }

  try {
    const first = await attempt()
    if (first) return first
    throw new Error('MiniMax: 请求失败')
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    if (!isAuthError(err)) throw err
    await sleep(2000)
    try {
      const retry = await attempt()
      if (retry) return retry
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      throw new Error(`MiniMax: ${msg}`)
    }
    throw new Error(`MiniMax: ${err.message}`)
  }
}
