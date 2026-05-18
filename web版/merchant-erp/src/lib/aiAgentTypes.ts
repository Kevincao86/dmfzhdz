/**
 * 墨典 AI 智能体 / 运营助理 — 前端状态与后续接入真实 API 的契约（预留）。
 */

/** 系统侧能力授权（后续与租户权限、OAuth 范围对齐） */
export type AiPermissionId =
  | 'product'
  | 'store'
  | 'influencer'
  | 'review'
  | 'sync'

export const AI_PERMISSION_LABELS: Record<AiPermissionId, string> = {
  product: '商品管理权限',
  store: '店铺管理权限',
  influencer: '达人招募权限',
  review: '评价处理权限',
  sync: '平台同步权限',
}

/** 可编排的任务类型 */
export type AiTaskType =
  | 'create_product'
  | 'recruit_influencer'
  | 'handle_review'
  | 'sync_platform'
  | 'analyze_exception'
  | 'generate_copywriting'

export const AI_TASK_TYPE_LABELS: Record<AiTaskType, string> = {
  create_product: '创建商品',
  recruit_influencer: '招募达人',
  handle_review: '处理评价',
  sync_platform: '同步平台',
  analyze_exception: '分析异常',
  generate_copywriting: '生成推广文案',
}

/** 新对话 / 重置时的首条助手问候（与上下文初始态一致） */
export const AI_AGENT_WELCOME_CONTENT =
  '你好，我是墨典 AI 助手。选好助手风格后，直接描述你想做的事；需要改商品、发消息等操作时，我会先给你看步骤说明，你确认后再继续。'

/** 智能体首页与抽屉共用的快捷任务 */
export const AI_AGENT_SHORTCUTS: { type: AiTaskType; label: string }[] = [
  { type: 'create_product', label: '创建商品' },
  { type: 'recruit_influencer', label: '招募达人' },
  { type: 'handle_review', label: '处理评价' },
  { type: 'sync_platform', label: '同步平台' },
  { type: 'analyze_exception', label: '分析异常' },
  { type: 'generate_copywriting', label: '生成推广文案' },
]

/** 对话与任务流消息角色 */
export type AiAgentMessageRole = 'user' | 'assistant' | 'system' | 'task_preview' | 'task_result'

export type AiProductPlanPreview = {
  productName: string
  suggestedPriceYuan: number
  originYuan?: number
  description: string
  comboLines: string[]
  marginNote?: string
  competitorNote?: string
  riskLevel?: 'low' | 'medium' | 'high'
}

export type AiTaskPreviewPayload = {
  title: string
  steps: string[]
  taskType: AiTaskType
  /** 创建商品：结构化方案（确认后进入创建向导预填） */
  productPlan?: AiProductPlanPreview
}

/** 输入框中待发送的「引用某条对话」片段（发送后写入用户消息正文前缀） */
export type AiAgentPendingQuote = {
  quotedMessageId: string
  role: 'user' | 'assistant'
  excerpt: string
}

export type AiAgentMessage = {
  id: string
  role: AiAgentMessageRole
  content: string
  createdAt: number
  /** 用户消息附带的截图预览（data URL） */
  imageUrls?: string[]
  /** 待确认的执行预览（仅 task_preview 使用） */
  preview?: AiTaskPreviewPayload
  /** 任务完成摘要（仅 task_result） */
  resultSummary?: string
}

/** 侧边栏「历史对话」快照（条数由上下文裁剪，最多 10 条） */
export type AiAgentArchivedSession = {
  id: string
  title: string
  messages: AiAgentMessage[]
  updatedAt: number
}

export type AiAgentOpenContext = {
  /** 当前页面名称，如「商品管理」 */
  pageLabel?: string
  /** 路由 path */
  pagePath?: string
  /** 页面建议的可执行任务文案 */
  suggestedTasks?: string[]
  /** 预填输入框 */
  draftInput?: string
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createAgentMessage(
  role: AiAgentMessageRole,
  content: string,
  extra?: Partial<Pick<AiAgentMessage, 'preview' | 'resultSummary' | 'imageUrls'>>,
): AiAgentMessage {
  return {
    id: newId(),
    role,
    content,
    createdAt: Date.now(),
    ...extra,
  }
}
