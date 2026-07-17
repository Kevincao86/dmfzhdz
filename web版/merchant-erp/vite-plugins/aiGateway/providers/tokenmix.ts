import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { resolveTokenMixModelId } from '../../../src/services/ai/tokenmixClient.js'
import { toOpenAiChatCompletionMessages } from '../openAiChatMessages.js'

/**
 * 四大家族（OpenAI/Claude/Gemini/Grok）经 TokenMix OpenAI-compatible relay；多模态（附图）仅在此路径拼装。
 * @see https://tokenmix.ai/docs
 */
export async function chatTokenMix(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const apiKey = (env.TOKENMIX_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('TOKENMIX_API_KEY 未配置')

  const baseRaw = (env.TOKENMIX_BASE_URL ?? 'https://api.tokenmix.ai/v1').trim().replace(/\/$/, '')
  const model = resolveTokenMixModelId({ modelFamily: req.modelFamily, model: req.model }, env)

  const { default: OpenAI } = await import('openai')

  const client = new OpenAI({
    apiKey,
    baseURL: baseRaw,
  })

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: toOpenAiChatCompletionMessages(req),
      temperature: req.temperature ?? 0.7,
      ...(req.tools?.length
        ? {
            tools: req.tools as Parameters<typeof client.chat.completions.create>[0]['tools'],
            ...(req.tool_choice != null
              ? {
                  tool_choice: req.tool_choice as Parameters<
                    typeof client.chat.completions.create
                  >[0]['tool_choice'],
                }
              : {}),
          }
        : {}),
    })
    const choiceMsg = completion.choices[0]?.message
    const msg = choiceMsg?.content
    const content = typeof msg === 'string' ? msg : ''
    const rawCalls = choiceMsg?.tool_calls as
      | Array<{ id?: string; function?: { name?: string; arguments?: string } }>
      | undefined
    const tool_calls =
      Array.isArray(rawCalls) && rawCalls.length
        ? rawCalls
            .map((c, i) => ({
              id: c.id || `call_${i}`,
              type: 'function' as const,
              function: {
                name: c.function?.name || '',
                arguments:
                  typeof c.function?.arguments === 'string' ? c.function.arguments : '{}',
              },
            }))
            .filter((c) => c.function.name)
        : undefined
    return {
      provider: 'tokenmix',
      model: completion.model ?? model,
      content,
      raw: completion as unknown as Record<string, unknown>,
      usage: completion.usage as unknown as Record<string, unknown>,
      ...(tool_calls?.length ? { tool_calls } : {}),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`TokenMix chat.completions: ${msg}`)
  }
}
