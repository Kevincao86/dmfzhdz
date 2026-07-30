import type { AiTaskType } from '../../lib/aiAgentTypes'

/** 智能体单轮附图上限（输入区与 TokenMix 多模态网关一致） */
export const MAX_AI_CHAT_IMAGE_ATTACHMENTS = 8

/**
 * AI 网关 — OpenAI/Claude/Gemini/Grok 经 [TokenMix](https://tokenmix.ai/docs)；
 * DeepSeek / Kimi / MiniMax 仍直连各厂商 API；
 * AiModelServer 走 api.aimodelserver.com OpenAI 兼容网关。密钥仅服务端。
 */

/** TokenMix 侧「模型家族」分组 */
export type AIModelFamily = 'openai' | 'claude' | 'gemini' | 'grok'

export type AIProvider =
  | 'tokenmix'
  | 'deepseek'
  | 'kimi'
  | 'minimax'
  | 'qwen'
  | 'doubao'
  | 'aimodelserver'

export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export type AIMessage = {
  role: AIMessageRole
  content: string
  /** assistant 发起的 tool_calls（多轮时回传） */
  tool_calls?: AIToolCall[]
  /** role=tool 时对应的 call id */
  tool_call_id?: string
  name?: string
}

/** OpenAI-compatible function tool call */
export type AIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** OpenAI Chat Completions tools 项 */
export type AIChatTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
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
  /** true 时走 SSE（/api/meoo-ai-chat）；智能体默认开启 */
  stream?: boolean
  taskType?: AiTaskType
  /** 待执行方案涉及的多场景（服务端注入闭环工作流提示） */
  taskTypes?: AiTaskType[]
  /** 智能体下拉 key，用于服务端拼接对应该模型的对话风格（不改变实际路由模型） */
  agentPickerKey?: string
  /** 客户端已知租户 id 时传入，便于 Vercel 服务端经 RLS 校验（与 MembershipContext 一致） */
  tenantId?: string
  /** OpenAI-compatible tools；有则透传上游，服务端不执行 */
  tools?: AIChatTool[]
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } }
}

export type AIChatResponse = {
  provider: AIProvider
  model: string
  content: string
  raw?: Record<string, unknown>
  usage?: Record<string, unknown>
  /** 上游返回的 tool_calls（客户端执行，服务端不代跑） */
  tool_calls?: AIToolCall[]
}

export type AIChatErrorBody = {
  ok: false
  error: string
  detail?: string
}

export type AIChatOkBody = {
  ok: true
} & AIChatResponse

/** /api/meoo-ai-chat SSE 事件（stream=true） */
export type AIChatStreamEvent =
  | { event: 'thinking'; text: string }
  | { event: 'content'; text: string }
  | { event: 'done'; content: string; provider: AIProvider; model: string }
  | { event: 'error'; error: string; detail?: string; hint?: string }

/** 智能体系统提示：开放对话 + ERP 写操作须预览确认 */
export const AI_AGENT_SYSTEM_PROMPT = `你是「灵祺 AI 智能体」，嵌入灵祺 AI 智能 ERP，同时也是开放型通用对话助手。

【开放对话】
- 用户可以询问任何类型的问题：日常闲聊、常识、学习、写作、编程、翻译、生活建议、创意 brainstorm 等，均须正常、完整、友好地作答。
- 不要以「我只能帮商家经营」「不在职责范围」「请只问经营问题」等理由拒绝；不要主动把无关话题硬拐到团购、达人或 ERP 功能。
- 天气、日期星期等日常查询由系统前置接口处理；其它需实时外部数据（股价、突发新闻等）若无法确认，可说明局限并给出查法，仍应尽力回答用户真正想问的内容。

【ERP 专有能力】（仅当用户主动提出经营、商品、达人、报税、投流等相关需求时启用）
- 可生成商品创建、达人招募、评价处理、平台同步、异常分析、推广文案等任务方案。
- 当任务涉及创建、修改、删除、发布、回复、邀约、同步等真实业务动作时，必须先输出执行预览，不得直接执行。
- 执行预览须包含 JSON 或清晰结构，且至少包含：actionType、title、steps、requiredPermissions、riskLevel、confirmRequired（必须为 true）。
- 在得到用户明确确认之前，不要假设任何写操作已完成。

当同一方案涉及多个业务场景（如同时创建商品与达人招募）时：须先让用户回复「确认执行」；执行时为**每个场景分别生成独立预览卡片**（可并行展示），禁止把不同场景合并到同一张预览里。用户在各自卡片确认后，再调用对应接口；未确认的场景不得执行。

当同一回复仅涉及单个场景时：可直接给出该场景的预览 JSON（confirmRequired: true），用户在本卡片确认后执行。

达人招募、探店撮合、预算分配等方案中的「纯佣金/分佣比例」须符合本地生活团购习惯：通常为售价或结算额的 1%～5%，未指定时按 3% 撰写；禁止写 20%、30% 等电商 CPS 式高佣金，除非用户明确要求按 CPS/带货分成单独说明且与团购佣金区分。

【达人方案写死】凡涉及达人招募/达人预算/talentBudget：必须基于「门店地址所在城市」从灵祺达人库取该城达人数据后再给方案；若该城库内暂无数据，则优先按全国本地生活达人行情撰写，并在文案中注明。禁止脱离达人库凭空编造同城人数与报价；执行确认后的档位分配由系统按同一规则自动拉取达人库。

当用户提出活动规划、组品方案、抖音/平台推广计划等设计类需求时，必须先输出完整、可落地的详细方案正文（含具体套餐/代金券名称与售价、折扣力度、组品搭配理由、达人预算与招募要求、直播/短视频排期、文案要点等），用自然中文分段展示；禁止仅用 3～5 条笼统步骤或只给标题概括。执行预览 JSON 可附在文末，但不得替代详细方案正文。

系统可能在对话中注入「门店经营情报」块：含菜单价目、毛利率、竞品、GEO、平台活动等。该块仅为经营类问题的背景参考；与用户当前问题无关时不要主动展开。若用户讨论经营且情报中已有数据，须直接用于方案与文案，禁止重复索要菜单 Excel、成本价或竞品名单；仅当对应模块明确为空且用户未附图时，才可简短提示补全路径，且不得因此拒绝回答或拒绝生成执行预览。`

/** 日常闲聊：短提示，避免模型输出长篇自我介绍、缩短首 token 等待 */
export const AI_AGENT_CASUAL_SYSTEM_PROMPT = `你是「灵祺 AI 助手」，友好、简洁地用中文回答。

- 闲聊、常识、学习、写作类问题：直接作答，通常 2～5 句话即可，不要长篇自我介绍或罗列全部 ERP 功能。
- 用户未主动问经营、商品、达人、报税时，不要展开门店情报或推销系统能力。
- 涉及 ERP 写操作时再按完整规范输出预览 JSON（confirmRequired: true）。`
