import type { AiAgentToolCall } from './types'

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function normalizeOne(raw: unknown, index: number): AiAgentToolCall | null {
  const o = asRecord(raw)
  if (!o) return null

  // OpenAI: { id, type, function: { name, arguments } }
  const fn = asRecord(o.function)
  if (fn && typeof fn.name === 'string') {
    const args =
      typeof fn.arguments === 'string'
        ? fn.arguments
        : fn.arguments != null
          ? JSON.stringify(fn.arguments)
          : '{}'
    return {
      id: typeof o.id === 'string' && o.id ? o.id : `call_${index}`,
      type: 'function',
      function: { name: fn.name, arguments: args },
    }
  }

  // DashScope / some Qwen: { id, name, arguments } or function_call
  if (typeof o.name === 'string') {
    const args =
      typeof o.arguments === 'string'
        ? o.arguments
        : o.arguments != null
          ? JSON.stringify(o.arguments)
          : '{}'
    return {
      id: typeof o.id === 'string' && o.id ? o.id : `call_${index}`,
      type: 'function',
      function: { name: o.name, arguments: args },
    }
  }

  const legacy = asRecord(o.function_call)
  if (legacy && typeof legacy.name === 'string') {
    const args =
      typeof legacy.arguments === 'string'
        ? legacy.arguments
        : legacy.arguments != null
          ? JSON.stringify(legacy.arguments)
          : '{}'
    return {
      id: typeof o.id === 'string' && o.id ? o.id : `call_${index}`,
      type: 'function',
      function: { name: legacy.name, arguments: args },
    }
  }

  return null
}

/** 从 OpenAI / DashScope 兼容 chat 原始 JSON 中提取 tool_calls */
export function extractToolCallsFromChatRaw(raw: unknown): AiAgentToolCall[] {
  const root = asRecord(raw)
  if (!root) return []

  const choices = Array.isArray(root.choices) ? root.choices : []
  const choice0 = asRecord(choices[0])
  const message = asRecord(choice0?.message) ?? asRecord(root.message) ?? asRecord(root.output)

  const buckets: unknown[] = []
  if (message) {
    if (Array.isArray(message.tool_calls)) buckets.push(...message.tool_calls)
    if (message.function_call) buckets.push(message.function_call)
    // DashScope sometimes: message.tool_calls 已覆盖；另见 output.choices
  }
  if (Array.isArray(root.tool_calls)) buckets.push(...root.tool_calls)

  const out: AiAgentToolCall[] = []
  for (let i = 0; i < buckets.length; i++) {
    const n = normalizeOne(buckets[i], i)
    if (n) out.push(n)
  }
  return out
}
