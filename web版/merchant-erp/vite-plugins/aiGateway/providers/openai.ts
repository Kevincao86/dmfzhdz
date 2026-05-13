import OpenAI from 'openai'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { registryEntry } from '../../../src/services/ai/modelRegistry.js'

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

function extractResponsesText(resp: unknown): string {
  const r = resp as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }
  if (typeof r.output_text === 'string' && r.output_text.trim()) return r.output_text.trim()
  const parts: string[] = []
  for (const item of r.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === 'string' && c.text) parts.push(c.text)
    }
  }
  return parts.join('\n').trim()
}

export async function chatOpenAI(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const apiKey = (env.OPENAI_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY 未配置')
  const reg = registryEntry('openai')
  const model = (req.model ?? env.OPENAI_MODEL ?? reg?.defaultModel ?? 'gpt-4o').trim()
  const client = new OpenAI({ apiKey })

  if ((env.OPENAI_USE_RESPONSES ?? '').trim() === '1') {
    try {
      const input = req.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n')
      const resp = await client.responses.create({
        model,
        input,
      })
      const content = extractResponsesText(resp)
      if (content) {
        return {
          provider: 'openai',
          model,
          content,
          raw: resp as unknown as Record<string, unknown>,
        }
      }
    } catch {
      /* 回退 chat.completions */
    }
  }

  const completion = await client.chat.completions.create({
    model,
    messages: toOpenAiMessages(req.messages),
    temperature: req.temperature ?? 0.7,
  })
  const msg = completion.choices[0]?.message?.content
  const content = typeof msg === 'string' ? msg : ''
  return {
    provider: 'openai',
    model: completion.model ?? model,
    content,
    raw: completion as unknown as Record<string, unknown>,
    usage: completion.usage as unknown as Record<string, unknown>,
  }
}
