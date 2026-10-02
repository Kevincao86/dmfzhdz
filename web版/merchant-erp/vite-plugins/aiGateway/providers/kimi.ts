import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { assertDistinctFromTokenMix, looksLikeJwtCredential } from '../../../src/lib/aiVendorKeyValidate.js'
import {
  moonshotChatBaseCandidates,
  moonshotChatModelCandidates,
  resolveMoonshotApiKey,
} from './directLlmEnv.js'
import { openAiCompatChatFetch, type OpenAiCompatMessage } from './openAiCompatibleFetch.js'

const KIMI_WEB_SEARCH_TOOL = {
  type: 'builtin_function',
  function: { name: '$web_search' },
} as const

function toMessages(messages: AIChatRequest['messages']): OpenAiCompatMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'user', content: `[tool]\n${m.content}` }
    if (m.role === 'system') return { role: 'system', content: m.content }
    if (m.role === 'assistant') return { role: 'assistant', content: m.content }
    return { role: 'user', content: m.content }
  })
}

function isAuthError(msg: string): boolean {
  return /401|invalid authentication/i.test(msg)
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
  const tools = [...(req.tools ?? []), KIMI_WEB_SEARCH_TOOL]

  const attempt = async (): Promise<AIChatResponse | null> => {
    let lastErr = 'Kimi: 请求失败'
    for (const baseURL of bases) {
      for (const model of models) {
        try {
          let roundMessages = messages
          for (let round = 0; round < 3; round += 1) {
            const completion = await openAiCompatChatFetch({
              baseURL,
              apiKey,
              model,
              messages: roundMessages,
              temperature,
              tools,
              tool_choice: req.tools?.length ? req.tool_choice : 'auto',
            })
            const calls = completion.tool_calls ?? []
            const searchCalls = calls.filter((call) => call.function.name === '$web_search')
            const otherCalls = calls.filter((call) => call.function.name !== '$web_search')
            if (!searchCalls.length) {
              return {
                provider: 'kimi',
                model: completion.model,
                content: completion.content,
                raw: completion.raw,
                ...(otherCalls.length ? { tool_calls: otherCalls } : {}),
              }
            }
            roundMessages = [
              ...roundMessages,
              {
                role: 'assistant',
                content: completion.content || '',
                tool_calls: calls,
              },
              ...searchCalls.map((call) => ({
                role: 'tool' as const,
                tool_call_id: call.id,
                name: '$web_search',
                content: call.function.arguments || '{}',
              })),
            ]
            if (otherCalls.length && round === 2) {
              return {
                provider: 'kimi',
                model: completion.model,
                content: completion.content,
                raw: completion.raw,
                tool_calls: otherCalls,
              }
            }
          }
          lastErr = 'Kimi: 联网搜索未返回正文'
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e)
          if (!/builtin_function|\$web_search|tools/i.test(lastErr)) continue
          try {
            const completion = await openAiCompatChatFetch({
              baseURL,
              apiKey,
              model,
              messages,
              temperature,
              ...(req.tools?.length ? { tools: req.tools, tool_choice: req.tool_choice } : {}),
            })
            return {
              provider: 'kimi',
              model: completion.model,
              content: completion.content,
              raw: completion.raw,
              ...(completion.tool_calls?.length ? { tool_calls: completion.tool_calls } : {}),
            }
          } catch (retryErr) {
            lastErr = retryErr instanceof Error ? retryErr.message : String(retryErr)
          }
        }
      }
    }
    throw new Error(`Kimi: ${lastErr}`)
  }

  try {
    const first = await attempt()
    if (first) return first
    throw new Error('Kimi: 请求失败')
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    if (!isAuthError(err)) throw e instanceof Error ? e : new Error(err)
    await sleep(1500)
    try {
      const retry = await attempt()
      if (retry) return retry
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      throw new Error(`Kimi: ${msg}（国内 Key 用 api.moonshot.cn，国际用 api.moonshot.ai）`)
    }
    throw new Error(`Kimi: ${err}（国内 Key 用 api.moonshot.cn，国际用 api.moonshot.ai）`)
  }
}
