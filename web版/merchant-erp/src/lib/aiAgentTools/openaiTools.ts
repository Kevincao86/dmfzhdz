import type { AiAgentToolDef } from './types'

/** OpenAI Chat Completions tools 格式 */
export function toOpenAiTools(defs: AiAgentToolDef[]) {
  return defs.map((d) => ({
    type: 'function' as const,
    function: {
      name: d.name,
      description: d.description,
      parameters: d.parameters,
    },
  }))
}

export function parseToolCallArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw) as unknown
      if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>
    } catch {
      return { raw }
    }
  }
  return {}
}
