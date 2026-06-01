/**
 * 助手回复中的「思考块」解析（MiniMax / DeepSeek / Kimi 等常见标签）。
 * 供流式 UI 与最终展示共用。
 */

const CLOSED_THINK_PATTERNS: RegExp[] = [
  /([\s\S]*?)<\/think>/gi,
  /<think>([\s\S]*?)<\/redacted_thinking>/gi,
  /<think>([\s\S]*?)<\/think>/gi,
  /<thinking>([\s\S]*?)<\/thinking>/gi,
  /<reasoning>([\s\S]*?)<\/reasoning>/gi,
  /<analysis>([\s\S]*?)<\/analysis>/gi,
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

/** 拼接模型输出中所有已闭合思考块正文 */
export function extractAssistantThinkingText(s: string): string {
  if (!s?.trim()) return ''
  const parts: string[] = []
  for (const re of CLOSED_THINK_PATTERNS) {
    parts.push(...collectMatches(s, re))
  }
  return parts.join('\n\n').trim()
}

/** 去掉思考块，仅保留对用户可见的正文（含未闭合尾部） */
export function stripAssistantThinkingBlocks(s: string): string {
  if (!s?.trim()) return ''
  let t = s.trim()
  for (let i = 0; i < 12; i++) {
    const prev = t
    t = t
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
      .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
      .trim()
    if (t === prev) break
  }
  t = t
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<thinking>[\s\S]*$/gi, '')
    .replace(/<reasoning>[\s\S]*$/gi, '')
    .replace(/<analysis>[\s\S]*$/gi, '')
    .trim()
  return t
}

/** 流式/完成态：思考区文案 + 可见回答（未做 markdown 清理） */
export function splitAssistantStreamView(raw: string): { thinking: string; answer: string } {
  const thinking = extractAssistantThinkingText(raw)
  const answer = stripAssistantThinkingBlocks(raw)
  return { thinking, answer }
}
