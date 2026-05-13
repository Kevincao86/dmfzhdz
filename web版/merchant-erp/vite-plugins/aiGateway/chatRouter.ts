import type { AIChatRequest, AIChatResponse } from '../../src/services/ai/types.js'
import { chatAnthropic } from './providers/anthropic.js'
import { chatDeepseek } from './providers/deepseek.js'
import { chatKimi } from './providers/kimi.js'
import { chatOpenAI } from './providers/openai.js'
import { chatXai } from './providers/xai.js'

export async function routeAiChat(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  switch (req.provider) {
    case 'openai':
      return chatOpenAI(req, env)
    case 'anthropic':
      return chatAnthropic(req, env)
    case 'xai':
      return chatXai(req, env)
    case 'deepseek':
      return chatDeepseek(req, env)
    case 'kimi':
      return chatKimi(req, env)
    default:
      throw new Error(`unknown provider: ${String((req as AIChatRequest).provider)}`)
  }
}
