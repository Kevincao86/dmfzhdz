import type { AIChatRequest, AIChatResponse } from '../../../src/services/ai/types.js'
import type { AIMessage } from '../../../src/services/ai/types.js'
import { isQuotaHopableError } from '../../../src/lib/vendorModelPool.js'
import { merchantAgentChatFromMessages } from '../../merchantAiUpstream.js'
import { estimateLlmTokensFromText } from '../../aiTokenUsageCore.js'

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
  return {
    provider: 'qwen',
    model: modelUsed,
    content: text,
    usage: estimateLlmTokensFromText(`${system}\n${user}`, text),
  }
}

export async function chatDoubaoAgent(req: AIChatRequest, env: Record<string, string>): Promise<AIChatResponse> {
  const { system, user } = flattenMessages(req.messages)
  const mo = req.model?.trim() || undefined
  let doubaoErr = ''
  try {
    const { text, modelUsed } = await merchantAgentChatFromMessages(env, 'doubao', mo, system, user)
    return {
      provider: 'doubao',
      model: modelUsed,
      content: text,
      usage: estimateLlmTokensFromText(`${system}\n${user}`, text),
    }
  } catch (e) {
    doubaoErr = e instanceof Error ? e.message : String(e)
    if (!isQuotaHopableError(doubaoErr)) throw e
  }
  try {
    const { text, modelUsed } = await merchantAgentChatFromMessages(env, 'qwen', undefined, system, user)
    return {
      provider: 'qwen',
      model: modelUsed,
      content: text,
      usage: estimateLlmTokensFromText(`${system}\n${user}`, text),
    }
  } catch (e) {
    const qwenErr = e instanceof Error ? e.message : String(e)
    throw new Error(
      `${doubaoErr}；豆包语言模型池已用尽，已自动切换通义千问仍失败：${qwenErr}`,
    )
  }
}
