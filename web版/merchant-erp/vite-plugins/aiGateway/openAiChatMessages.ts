import type { AIChatRequest } from '../../src/services/ai/types.js'

/**
 * OpenAI Chat Completions 形态（与 openai SDK 兼容），不依赖 `openai/resources/...` 子路径：
 * Vercel 打包时深层子路径偶发解析异常会导致整条 `/api/meoo-ai-chat` 模块加载失败（全模型 500）。
 */
type OpenAiChatPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type OpenAiChatMessage =
  | { role: 'system'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'user'; content: string | OpenAiChatPart[] }

/** 将 AIMessage 转为 OpenAI Chat Completions 消息；若有 imageDataUrls，则合并进「最后一条 user」为多模态 */
export function toOpenAiChatCompletionMessages(req: AIChatRequest): OpenAiChatMessage[] {
  const imgs = (req.imageDataUrls ?? [])
    .filter((u) => typeof u === 'string' && u.startsWith('data:image/'))
    .slice(0, 4)

  const rows: OpenAiChatMessage[] = req.messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'user', content: `[tool 输出]\n${m.content}` }
    }
    if (m.role === 'system') return { role: 'system', content: m.content }
    if (m.role === 'assistant') return { role: 'assistant', content: m.content }
    return { role: 'user', content: m.content }
  })

  if (!imgs.length) return rows

  let lastUserIdx = -1
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx < 0) return rows

  const cur = rows[lastUserIdx]
  const text =
    typeof cur === 'object' && cur && 'content' in cur && typeof (cur as { content?: unknown }).content === 'string'
      ? ((cur as { content: string }).content ?? '')
      : ''

  const parts: OpenAiChatPart[] = []
  if (text.trim()) parts.push({ type: 'text', text })
  for (const url of imgs) {
    parts.push({ type: 'image_url', image_url: { url } })
  }
  if (parts.length === 0) parts.push({ type: 'text', text: '（见附图）' })

  const next = [...rows]
  next[lastUserIdx] = { role: 'user', content: parts }
  return next
}
