import OpenAI from 'openai'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { registryEntry } from '../../../src/services/ai/modelRegistry.js'
import { toOpenAiChatCompletionMessages } from '../openAiChatMessages.js'

export async function chatKimi(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const apiKey = (env.MOONSHOT_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('MOONSHOT_API_KEY 未配置')
  const reg = registryEntry('kimi')
  const model = (req.model ?? env.KIMI_MODEL ?? reg?.defaultModel ?? 'moonshot-v1-8k').trim()
  const baseURL = (env.KIMI_BASE_URL ?? 'https://api.moonshot.ai/v1').trim().replace(/\/$/, '')
  const client = new OpenAI({ apiKey, baseURL: `${baseURL}/` })
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: toOpenAiChatCompletionMessages(req),
      temperature: req.temperature ?? 0.6,
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
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Kimi: ${msg}`)
  }
}
