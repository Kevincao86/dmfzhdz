/**
 * 助手回复中的「思考块」解析（MiniMax / DeepSeek / Kimi 等常见标签）。
 * 供流式 UI 与最终展示共用。
 */

const CLOSED_BLOCK_RES: RegExp[] = [
  /<think>[\s\S]*?<\/think>/gi,
  /<think>[\s\S]*?<\/redacted_thinking>/gi,
  /<think>[\s\S]*?<\/think>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
  /<analysis>[\s\S]*?<\/analysis>/gi,
]

const UNCLOSED_BLOCK_RES: RegExp[] = [
  /<think>[\s\S]*$/gi,
  /<think>[\s\S]*$/gi,
  /<thinking>[\s\S]*$/gi,
  /<reasoning>[\s\S]*$/gi,
  /<analysis>[\s\S]*$/gi,
]

const CLOSED_THINK_CAPTURE: RegExp[] = [
  /<think>([\s\S]*?)<\/think>/gi,
  /<think>([\s\S]*?)<\/redacted_thinking>/gi,
  /<think>([\s\S]*?)<\/think>/gi,
  /<thinking>([\s\S]*?)<\/thinking>/gi,
  /<reasoning>([\s\S]*?)<\/reasoning>/gi,
  /<analysis>([\s\S]*?)<\/analysis>/gi,
  /([\s\S]*?)<\/think>/gi,
]

function collectMatches(s: string, re: RegExp): string[] {
  const out: string[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    const t = (m[1] ?? '').trim()
    if (t) out.push(t)
  }
  return out
}

function applyRegexList(input: string, list: RegExp[]): string {
  let t = input
  for (let i = 0; i < 12; i++) {
    const prev = t
    for (const re of list) t = t.replace(re, '')
    t = t.trim()
    if (t === prev) break
  }
  return t
}

function stripMiniMaxSuffix(raw: string): string {
  const tc = '</think>'
  const idx = raw.indexOf(tc)
  if (idx < 0) return raw
  const after = raw.slice(idx + tc.length).trim()
  if (after) return after
  return raw.slice(0, idx).trim()
}

export function extractAssistantThinkingText(s: string): string {
  if (!s?.trim()) return ''
  const parts: string[] = []
  for (const re of CLOSED_THINK_CAPTURE) {
    parts.push(...collectMatches(s, re))
  }
  return parts.join('\n\n').trim()
}

export function stripAssistantThinkingBlocks(s: string): string {
  if (!s?.trim()) return ''
  let t = stripMiniMaxSuffix(s.trim())
  t = applyRegexList(t, CLOSED_BLOCK_RES)
  t = applyRegexList(t, UNCLOSED_BLOCK_RES).trim()
  return t
}

export function splitAssistantStreamView(raw: string): { thinking: string; answer: string } {
  const thinking = extractAssistantThinkingText(raw)
  const answer = stripAssistantThinkingBlocks(raw)
  return { thinking, answer }
}

export function resolveAssistantVisibleText(raw: string): string {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return ''
  const { thinking, answer } = splitAssistantStreamView(trimmed)
  if (answer.trim()) return answer.trim()
  if (thinking.trim()) return thinking.trim()
  const tagless = trimmed.replace(/<\/?[a-z_]+>/gi, '').trim()
  if (tagless) return tagless
  return trimmed
}
