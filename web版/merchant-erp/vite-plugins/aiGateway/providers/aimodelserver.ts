import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import { registryEntry } from '../../../src/services/ai/modelRegistry.js'
import { openAiCompatChatFetch, type OpenAiCompatMessage } from './openAiCompatibleFetch.js'

const DEFAULT_BASE = 'https://api.aimodelserver.com/v1'

function toMessages(messages: AIChatRequest['messages']): OpenAiCompatMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'user', content: `[tool]\n${m.content}` }
    if (m.role === 'system') return { role: 'system', content: m.content }
    if (m.role === 'assistant') return { role: 'assistant', content: m.content }
    return { role: 'user', content: m.content }
  })
}

export function resolveAimodelserverApiKey(env: Record<string, string>): string {
  return (env.AIMODELSERVER_API_KEY ?? env.AIMODEL_API_KEY ?? '').trim()
}

export function resolveAimodelserverBaseUrl(env: Record<string, string>): string {
  const raw = (env.AIMODELSERVER_BASE_URL ?? DEFAULT_BASE).trim()
  return raw.replace(/\/$/, '') || DEFAULT_BASE
}

/**
 * AiModelServer（New API 兼容网关）· OpenAI Chat Completions
 * Base: https://api.aimodelserver.com/v1 → POST /chat/completions
 */
export async function chatAimodelserver(
  req: AIChatRequest,
  env: Record<string, string>,
): Promise<AIChatResponse> {
  const apiKey = resolveAimodelserverApiKey(env)
  if (!apiKey) {
    throw new Error(
      'AIMODELSERVER_API_KEY 未配置（请在运营台「AI 模型」填写 AiModelServer 密钥）',
    )
  }
  const reg = registryEntry('aimodelserver')
  const model = (
    req.model ??
    env.AIMODELSERVER_MODEL ??
    reg?.defaultModel ??
    'gpt-5.4'
  ).trim()
  const baseURL = resolveAimodelserverBaseUrl(env)
  const completion = await openAiCompatChatFetch({
    baseURL,
    apiKey,
    model,
    messages: toMessages(req.messages),
    temperature: req.temperature ?? 0.6,
    ...(req.tools?.length ? { tools: req.tools, tool_choice: req.tool_choice } : {}),
  })
  return {
    provider: 'aimodelserver',
    model: completion.model,
    content: completion.content,
    raw: completion.raw,
    ...(completion.tool_calls?.length ? { tool_calls: completion.tool_calls } : {}),
  }
}
