import OpenAI from 'openai'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { resolveTokenMixModelId } from '../../../src/services/ai/tokenmixClient.js'

function toOpenAiMessages(messages: AIChatRequest['messages']): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'user', content: `[tool 输出]\n${m.content}` } satisfies OpenAI.Chat.ChatCompletionMessageParam
    }
    if (m.role === 'system') return { role: 'system', content: m.content }
    if (m.role === 'assistant') return { role: 'assistant', content: m.content }
    return { role: 'user', content: m.content }
  })
}

/**
 * OpenAI/Claude/Gemini/Grok 经 TokenMix OpenAI-compatible relay。
 * @see https://tokenmix.ai/docs
 */
export async function chatTokenMix(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const apiKey = (env.TOKENMIX_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('TOKENMIX_API_KEY 未配置')

  const baseRaw = (env.TOKENMIX_BASE_URL ?? 'https://api.tokenmix.ai/v1').trim().replace(/\/$/, '')
  const model = resolveTokenMixModelId({ modelFamily: req.modelFamily, model: req.model }, env)

  const client = new OpenAI({
    apiKey,
    baseURL: baseRaw,
  })

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: toOpenAiMessages(req.messages),
      temperature: req.temperature ?? 0.7,
    })
    const msg = completion.choices[0]?.message?.content
    const content = typeof msg === 'string' ? msg : ''
    return {
      provider: 'tokenmix',
      model: completion.model ?? model,
      content,
      raw: completion as unknown as Record<string, unknown>,
      usage: completion.usage as unknown as Record<string, unknown>,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`TokenMix chat.completions: ${msg}`)
  }
}
