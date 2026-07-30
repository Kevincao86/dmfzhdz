import type { AIChatRequest, AIChatResponse } from '../../src/services/ai/types.js'

/**
 * 按 provider 动态 import，避免「为跑 DeepSeek 却先加载 Kimi/TokenMix/OpenAI 依赖」在 Vercel 冷启动上偶发整路由不可用。
 */
export async function routeAiChat(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  switch (req.provider) {
    case 'tokenmix': {
      const { chatTokenMix } = await import('./providers/tokenmix.js')
      return chatTokenMix(req, env)
    }
    case 'deepseek': {
      const { chatDeepseek } = await import('./providers/deepseek.js')
      return chatDeepseek(req, env)
    }
    case 'kimi': {
      const { chatKimi } = await import('./providers/kimi.js')
      return chatKimi(req, env)
    }
    case 'minimax': {
      const { chatMinimax } = await import('./providers/minimax.js')
      return chatMinimax(req, env)
    }
    case 'qwen': {
      const { chatQwenAgent } = await import('./providers/merchantLlmChat.js')
      return chatQwenAgent(req, env)
    }
    case 'doubao': {
      const { chatDoubaoAgent } = await import('./providers/merchantLlmChat.js')
      return chatDoubaoAgent(req, env)
    }
    case 'aimodelserver': {
      const { chatAimodelserver } = await import('./providers/aimodelserver.js')
      return chatAimodelserver(req, env)
    }
    default:
      throw new Error(`unknown provider: ${String((req as AIChatRequest).provider)}`)
  }
}
