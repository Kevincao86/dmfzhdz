import OpenAI from 'openai'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
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

export async function chatKimi(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const apiKey = resolveMoonshotApiKey(env)
  if (!apiKey) {
    throw new Error('MOONSHOT_API_KEY 未配置（请在运营台「AI 模型」填写 Kimi / Moonshot 密钥）')
  }
  if (!apiKey.startsWith('sk-')) {
    throw new Error(
      'Kimi Key 应以 sk- 开头（请在 platform.moonshot.cn 复制 API Key，勿填 TokenMix 或其它平台密钥）',
    )
  }
  const models = moonshotChatModelCandidates(env, req.model)
  const bases = moonshotChatBaseCandidates(env)
  const messages = toMessages(req.messages)
  const temperature = req.temperature ?? 0.6

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
  const hint = lastErr?.message?.includes('401')
    ? '（请确认运营台 Kimi 密钥有效，国内 Key 通常使用 api.moonshot.cn）'
    : ''
  throw new Error(`Kimi: ${lastErr?.message ?? '请求失败'}${hint}`)
}
