import type { AiTaskType } from '../../lib/aiAgentTypes'

/** 智能体单轮附图上限（输入区与 TokenMix 多模态网关一致） */
export const MAX_AI_CHAT_IMAGE_ATTACHMENTS = 8

/**
 * AI 网关 — OpenAI/Claude/Gemini/Grok 经 [TokenMix](https://tokenmix.ai/docs)；
 * DeepSeek / Kimi / MiniMax 仍直连各厂商 API。密钥仅服务端。
 */

/** TokenMix 侧「模型家族」分组 */
export type AIModelFamily = 'openai' | 'claude' | 'gemini' | 'grok'

export type AIProvider = 'tokenmix' | 'deepseek' | 'kimi' | 'minimax' | 'qwen' | 'doubao'

export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export type AIMessage = {
  role: AIMessageRole
  content: string
}

export type AIChatRequest = {
  provider: AIProvider
  /** 直连厂商或 TokenMix 的模型 id；TokenMix 下空串由服务端按 modelFamily 解析 */
  model?: string
  /** 仅 provider=tokenmix 时有效 */
  modelFamily?: AIModelFamily
  messages: AIMessage[]
  /** 本回合用户随附截图（data URL，最多 8 张）；由网关拼进多模态消息 */
  imageDataUrls?: string[]
  temperature?: number
  /** 预留：当前网关实现为非流式；stream=true 时返回 501 */
  stream?: boolean
  taskType?: AiTaskType
  /** 智能体下拉 key，用于服务端拼接对应该模型的对话风格（不改变实际路由模型） */
  agentPickerKey?: string
}

export type AIChatResponse = {
  provider: AIProvider
  model: string
  content: string
  raw?: Record<string, unknown>
  usage?: Record<string, unknown>
}

export type AIChatErrorBody = {
  ok: false
  error: string
  detail?: string
}

export type AIChatOkBody = {
  ok: true
} & AIChatResponse

/** 智能体系统提示：约束仅产出预览，不得直接执行业务写操作 */
export const AI_AGENT_SYSTEM_PROMPT = `你是「墨典 AI 智能体」，服务于本地生活商家 ERP。
你可以帮助用户咨询问题，也可以生成商品创建、达人招募、评价处理、平台同步、异常分析、推广文案等任务方案。
当任务涉及创建、修改、删除、发布、回复、邀约、同步等真实业务动作时，你必须先输出执行预览，不得直接执行。
执行预览必须包含 JSON 或清晰结构，且至少包含以下字段含义：
- actionType：动作类型（如 create_product）
- title：预览标题
- steps：步骤数组（字符串）
- requiredPermissions：所需权限列表
- riskLevel：low | medium | high
- confirmRequired：必须为 true

在得到用户明确确认之前，不要假设任何写操作已完成。`
