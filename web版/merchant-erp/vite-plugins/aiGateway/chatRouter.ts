import type { AIChatRequest, AIChatResponse } from '../../src/services/ai/types.js'
import { chatDeepseek } from './providers/deepseek.js'
import { chatKimi } from './providers/kimi.js'
import { chatMinimax } from './providers/minimax.js'
import { chatTokenMix } from './providers/tokenmix.js'

export async function routeAiChat(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  switch (req.provider) {
    case 'tokenmix':
      return chatTokenMix(req, env)
    case 'deepseek':
      return chatDeepseek(req, env)
    case 'kimi':
      return chatKimi(req, env)
    case 'minimax':
      return chatMinimax(req, env)
    default:
      throw new Error(`unknown provider: ${String((req as AIChatRequest).provider)}`)
  }
}
