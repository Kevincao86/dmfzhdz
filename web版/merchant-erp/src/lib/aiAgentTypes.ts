/**
 * 店魔方 AI 智能体 / 运营助理 — 前端状态与后续接入真实 API 的契约（预留）。
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

/** 对话与任务流消息角色 */
export type AiAgentMessageRole = 'user' | 'assistant' | 'system' | 'task_preview' | 'task_result'

export type AiTaskPreviewPayload = {
  title: string
  steps: string[]
  taskType: AiTaskType
}

export type AiAgentMessage = {
  id: string
  role: AiAgentMessageRole
  content: string
  createdAt: number
  /** 待确认的执行预览（仅 task_preview 使用） */
  preview?: AiTaskPreviewPayload
  /** 任务完成摘要（仅 task_result） */
  resultSummary?: string
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
  extra?: Partial<Pick<AiAgentMessage, 'preview' | 'resultSummary'>>,
): AiAgentMessage {
  return {
    id: newId(),
    role,
    content,
    createdAt: Date.now(),
    ...extra,
  }
}
