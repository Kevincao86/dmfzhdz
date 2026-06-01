import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { assertDistinctFromTokenMix, looksLikeJwtCredential } from '../../../src/lib/aiVendorKeyValidate.js'
import { looksLikeMinimaxJwtKey } from '../../merchantRegistryVendorEnv.js'
import {
  minimaxChatBaseCandidates,
  minimaxChatModelCandidates,
  resolveMinimaxApiKey,
} from './directLlmEnv.js'
import { openAiCompatChatFetch, type OpenAiCompatMessage } from './openAiCompatibleFetch.js'
import { registryEntry } from '../../../src/services/ai/modelRegistry.js'

function toMessages(messages: AIChatRequest['messages']): OpenAiCompatMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'user', content: `[tool]\n${m.content}` }
    if (m.role === 'system') return { role: 'system', content: m.content }
    if (m.role === 'assistant') return { role: 'assistant', content: m.content }
    return { role: 'user', content: m.content }
  })
}

function isAuthError(msg: string): boolean {
  return /401|2049|invalid api key|invalid authentication/i.test(msg)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
    let lastErr = 'MiniMax: 请求失败'
    for (const baseURL of bases) {
      for (const model of models) {
        try {
          const completion = await openAiCompatChatFetch({
            baseURL,
            apiKey,
            model,
            messages,
            temperature,
          })
          return {
            provider: 'minimax',
            model: completion.model,
            content: completion.content,
            raw: completion.raw,
          }
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e)
        }
      }
    }
    throw new Error(`MiniMax: ${lastErr}`)
  }

  try {
    const first = await attempt()
    if (first) return first
    throw new Error('MiniMax: 请求失败')
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    if (!isAuthError(err)) throw e instanceof Error ? e : new Error(err)
    await sleep(2000)
    try {
      const retry = await attempt()
      if (retry) return retry
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      throw new Error(`MiniMax: ${msg}`)
    }
    const regionHint =
      '国内账号用 platform.minimaxi.com 的 sk- Key + api.minimaxi.com；国际用 platform.minimax.io + api.minimax.io'
    throw new Error(`MiniMax: ${err}（${regionHint}）`)
  }
}
