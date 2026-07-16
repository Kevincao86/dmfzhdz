/** OpenAI-compatible function tool definition for AI 智能体 */

export type AiAgentJsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export type AiAgentToolDef = {
  name: string
  description: string
  parameters: AiAgentJsonSchema
  requiresConfirm?: boolean
}

/** 与 services/ai/types AIToolCall 对齐 */
export type AiAgentToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** 客户端工具执行结果（供 AiAgentContext.applyClientToolResults 消费） */
export type AiAgentClientToolResult = {
  call: AiAgentToolCall
  tool: string
  ok: boolean
  message: string
  needsUpload?: boolean
  needsConfirm?: boolean
  imageUrl?: string
  mode?: 'draft' | 'submit'
  platforms?: string[]
  planDraft?: Record<string, unknown>
  data?: Record<string, unknown>
  scenarioKey?: string
}
