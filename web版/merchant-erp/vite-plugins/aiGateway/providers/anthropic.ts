import Anthropic from '@anthropic-ai/sdk'
import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { registryEntry } from '../../../src/services/ai/modelRegistry.js'

export async function chatAnthropic(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const apiKey = (env.ANTHROPIC_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未配置')
  const reg = registryEntry('anthropic')
  const model = (req.model ?? env.ANTHROPIC_MODEL ?? reg?.defaultModel ?? 'claude-3-5-sonnet-latest').trim()

  const systemParts: string[] = []
  const msgs: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of req.messages) {
    if (m.role === 'system') {
      systemParts.push(m.content)
      continue
    }
    if (m.role === 'tool') {
      msgs.push({ role: 'user', content: `[tool]\n${m.content}` })
      continue
    }
    if (m.role === 'assistant') msgs.push({ role: 'assistant', content: m.content })
    else msgs.push({ role: 'user', content: m.content })
  }
  if (msgs.length === 0) {
    msgs.push({ role: 'user', content: '请根据系统说明继续。' })
  }

  const client = new Anthropic({ apiKey })
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemParts.length ? systemParts.join('\n\n') : undefined,
      messages: msgs,
      temperature: req.temperature ?? 0.6,
    })

    let text = ''
    for (const b of res.content) {
      if (b.type === 'text') text += b.text
    }

    return {
      provider: 'anthropic',
      model: res.model,
      content: text,
      raw: res as unknown as Record<string, unknown>,
      usage: res.usage as unknown as Record<string, unknown>,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Anthropic: ${msg}`)
  }
}
