import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import type { AIMessage } from '../../../src/services/ai/types.js'
import { merchantAgentChatFromMessages } from '../../merchantAiUpstream.js'

function flattenMessages(messages: AIMessage[]): { system: string; user: string } {
  const sys: string[] = []
  const dial: string[] = []
  for (const m of messages) {
    if (m.role === 'system') sys.push(m.content)
    else if (m.role === 'user') dial.push(`用户：${m.content}`)
    else if (m.role === 'assistant') dial.push(`助手：${m.content}`)
    else if (m.role === 'tool') dial.push(`工具：${m.content}`)
    else dial.push(`${m.role}：${m.content}`)
  }
  return {
    system: sys.join('\n\n').trim() || 'You are a helpful assistant.',
    user: dial.join('\n\n').trim() || '（空）',
  }
}

export async function chatQwenAgent(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const { system, user } = flattenMessages(req.messages)
  const mo = req.model?.trim() || undefined
  const { text, modelUsed } = await merchantAgentChatFromMessages(env, 'qwen', mo, system, user)
  return { provider: 'qwen', model: modelUsed, content: text }
}

export async function chatDoubaoAgent(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const { system, user } = flattenMessages(req.messages)
  const mo = req.model?.trim() || undefined
  const { text, modelUsed } = await merchantAgentChatFromMessages(env, 'doubao', mo, system, user)
  return { provider: 'doubao', model: modelUsed, content: text }
}
