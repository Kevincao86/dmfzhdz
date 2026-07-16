/**
 * 灵祺 AI 智能体 / 运营助理 — 前端状态与后续接入真实 API 的契约（预留）。
 */

/** 系统侧能力授权（后续与租户权限、OAuth 范围对齐） */
export type AiPermissionId =
  | 'product'
  | 'store'
  | 'influencer'
  | 'review'
  | 'sync'
  | 'local_ads'
  | 'local_leads'
  | 'finance_tax'

export const AI_PERMISSION_LABELS: Record<AiPermissionId, string> = {
  product: '商品管理权限',
  store: '店铺管理权限',
  influencer: '达人招募权限',
  review: '评价处理权限',
  sync: '平台同步权限',
  local_ads: '本地推投流数据',
  local_leads: '本地推线索跟进',
  finance_tax: '报税管理权限',
}

/** 可编排的任务类型 */
export type AiTaskType =
  | 'create_product'
  | 'recruit_influencer'
  | 'handle_review'
  | 'sync_platform'
  | 'analyze_exception'
  | 'generate_copywriting'
  | 'optimize_local_ads'
  | 'follow_local_lead'
  | 'file_tax'

export const AI_TASK_TYPE_LABELS: Record<AiTaskType, string> = {
  create_product: '创建商品',
  recruit_influencer: '招募达人',
  handle_review: '处理评价',
  sync_platform: '同步平台',
  analyze_exception: '分析异常',
  generate_copywriting: '生成推广文案',
  optimize_local_ads: '优化本地推投放',
  follow_local_lead: '跟进本地推线索',
  file_tax: '一键报税',
}

/** 新对话 / 重置时的首条助手问候（与上下文初始态一致） */
/** 默认问候；运行时由 {@link buildAiAgentPlanProfile} 按会员档位覆盖 */
export const AI_AGENT_WELCOME_CONTENT =
  '你好，我是灵祺 AI 助手。先在输入框右侧选好模型（对话或文生图），再描述任务；涉及改商品、发招募单、报税、发布等操作会先展示预览，确认后再继续。'

/** 智能体首页与抽屉共用的快捷任务 */
export const AI_AGENT_SHORTCUTS: { type: AiTaskType; label: string }[] = [
  { type: 'create_product', label: '创建商品' },
  { type: 'recruit_influencer', label: '招募达人' },
  { type: 'handle_review', label: '处理评价' },
  { type: 'optimize_local_ads', label: '优化本地推' },
  { type: 'follow_local_lead', label: '跟进线索' },
  { type: 'sync_platform', label: '同步平台' },
  { type: 'analyze_exception', label: '分析异常' },
  { type: 'generate_copywriting', label: '生成推广文案' },
  { type: 'file_tax', label: '一键报税' },
]

/** 对话与任务流消息角色 */
export type AiAgentMessageRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'task_preview'
  | 'task_result'
  | 'tool_status'
  | 'tool_result'
  | 'needs_upload'

/** 场景任务预览确认状态（每项任务独立） */
export type AiPreviewStatus = 'pending' | 'confirmed' | 'cancelled'

export type AiProductPlanPreview = {
  productName: string
  suggestedPriceYuan: number
  originYuan?: number
  description: string
  comboLines: string[]
  marginNote?: string
  competitorNote?: string
  riskLevel?: 'low' | 'medium' | 'high'
  /** 1 团购 / 2 代金券 */
  productType?: number
  headUrl?: string
  enrichStatus?: 'loading' | 'ready' | 'error'
  enrichError?: string
  /** 多商品预览时的展示标签（如「双人餐」） */
  slotLabel?: string
  slotKey?: string
}

/** 智能体确认后展示的招募订单明细（含 AI 档位分配） */
export type AiRecruitmentOrderDetail = {
  orderId: string
  opsStatusLabel: string
  platform: string
  storeName: string
  mainProductName: string
  budgetYuan: number
  totalHeadcount: number
  tags: string[]
  /** 列表卡片摘要 */
  briefExcerpt: string
  /** 详情弹层完整 Brief */
  briefText: string
  createdAt: string
  allocation: {
    v3: number
    v4: number
    v5: number
    v5plus: number
    source: 'library' | 'ai' | 'fallback'
    notes?: string
    costHint?: string
  }
}

/** 达人招募：图文 Brief 预览（确认后写入招募页） */
export type AiRecruitmentBriefPreview = {
  platform: string
  mainProductName: string
  tags: string[]
  briefText: string
  previews?: [string, string, string]
  enrichStatus?: 'loading' | 'ready' | 'error'
  enrichError?: string
}

export type AiTaskPreviewPayload = {
  title: string
  steps: string[]
  taskType: AiTaskType
  /** 创建商品：结构化方案（确认后进入创建向导预填） */
  productPlan?: AiProductPlanPreview
  /** 创建商品：多个套餐/代金券并列预览 */
  productPlans?: AiProductPlanPreview[]
  /** 达人招募：图文 Brief */
  recruitmentBrief?: AiRecruitmentBriefPreview
  /** 报税：汇总各已绑定平台后一键申报（需确认） */
  taxFiling?: AiTaxFilingPreview
}

/** 智能体报税预览（确认后导出申报包并标记状态） */
export type AiTaxFilingPreview = {
  periodLabel: string
  startDate: string
  endDate: string
  platforms: {
    platformId: string
    platformLabel: string
    bindingLabel: string
    verifyAmountYuan: number
    orderCount: number
    commissionRatePct?: number
    commissionAmountYuan?: number
    status: 'ready' | 'missing_binding'
  }[]
  totalVerifyYuan: number
  totalCommissionYuan?: number
  enrichStatus?: 'loading' | 'ready' | 'error'
  enrichError?: string
}

/** 输入框待发送附件：图片或本地视频（视频另带首帧 poster 供模型理解） */
export type AiComposerAttachment =
  | { kind: 'image'; url: string }
  | { kind: 'video'; previewUrl: string; posterUrl: string; name: string }

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
  /** 用户消息附带的图片或视频首帧预览（data URL） */
  imageUrls?: string[]
  /** 用户消息附带的本地视频预览（blob URL，刷新后可能失效） */
  videoUrls?: string[]
  /** 待确认的执行预览（仅 task_preview 使用） */
  preview?: AiTaskPreviewPayload
  /** 预览确认状态：多项场景任务各自独立 pending/confirmed/cancelled */
  previewStatus?: AiPreviewStatus
  /** 任务完成摘要（仅 task_result） */
  resultSummary?: string
  /** 流式回复生成中（占位气泡） */
  isStreaming?: boolean
  /** 模型思考过程（流式/完成后可选展示） */
  thinkingText?: string
  /** 达人招募确认后的订单明细（仅 task_result） */
  recruitmentOrder?: AiRecruitmentOrderDetail
  /** tool_status / tool_result / needs_upload 关联的工具名 */
  toolName?: string
  /** 结构化工具结果（可选） */
  toolResult?: Record<string, unknown>
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
  extra?: Partial<
    Pick<
      AiAgentMessage,
      | 'preview'
      | 'previewStatus'
      | 'resultSummary'
      | 'recruitmentOrder'
      | 'imageUrls'
      | 'videoUrls'
      | 'toolName'
      | 'toolResult'
    >
  >,
): AiAgentMessage {
  return {
    id: newId(),
    role,
    content,
    createdAt: Date.now(),
    ...(role === 'task_preview' && extra?.previewStatus == null ? { previewStatus: 'pending' as const } : {}),
    ...extra,
  }
}
