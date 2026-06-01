import OpenAI from 'openai'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { assertDistinctFromTokenMix, looksLikeJwtCredential } from '../../../src/lib/aiVendorKeyValidate.js'
import {
  moonshotChatBaseCandidates,
  moonshotChatModelCandidates,
  resolveMoonshotApiKey,
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
  return !!err?.message?.match(/401|invalid authentication/i)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function chatKimi(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const apiKey = resolveMoonshotApiKey(env)
  if (!apiKey) {
    throw new Error('MOONSHOT_API_KEY 未配置（请在运营台「AI 模型」填写 Kimi / Moonshot 密钥）')
  }
  if (looksLikeJwtCredential(apiKey)) {
    throw new Error(
      'Kimi Key 形如 JWT(eyJ…)，请在 platform.moonshot.cn → API Key 复制 sk- 开头密钥，勿填登录 Token 或 Supabase JWT',
    )
  }
  if (!apiKey.startsWith('sk-')) {
    throw new Error(
      'Kimi Key 应以 sk- 开头（请在 platform.moonshot.cn 复制 API Key，勿填 TokenMix 或其它平台密钥）',
    )
  }
  assertDistinctFromTokenMix('Kimi', apiKey, env.TOKENMIX_API_KEY)
  const models = moonshotChatModelCandidates(env, req.model)
  const bases = moonshotChatBaseCandidates(env)
  const messages = toMessages(req.messages)
  const temperature = req.temperature ?? 0.6

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
          })
          const msg = completion.choices[0]?.message?.content
          return {
            provider: 'kimi',
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
    throw new Error('Kimi: 请求失败')
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    if (!isAuthError(err)) {
      const hint = err.message?.includes('401')
        ? '（请确认运营台 Kimi 密钥有效，国内 Key 通常使用 api.moonshot.cn）'
        : ''
      throw new Error(`Kimi: ${err.message}${hint}`)
    }
    await sleep(1500)
    try {
      const retry = await attempt()
      if (retry) return retry
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      throw new Error(`Kimi: ${msg}（请确认运营台 Kimi 密钥有效，国内 Key 通常使用 api.moonshot.cn）`)
    }
    throw new Error(
      `Kimi: ${err.message}（请确认运营台 Kimi 密钥有效，国内 Key 通常使用 api.moonshot.cn）`,
    )
  }
}
