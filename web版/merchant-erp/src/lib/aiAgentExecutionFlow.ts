/**
 * AI 智能体执行流（对齐产品流程图）：
 * 用户输入 → 场景识别 → 给出方案+预览 → 用户确认/修改 → 调用接口 → 返回结果。
 * 多项九大场景任务可并行，每项各自独立预览确认窗口。
 */
import type { AiTaskType } from './aiAgentTypes'
import {
  filterScenarioTaskTypes,
  hasPendingPreviewForTask,
} from './aiAgentPreviewState'
import type { AiAgentMessage } from './aiAgentTypes'
import {
  inferTaskTypesFromCombinedContext,
  isExplicitExecutionIntent,
  isUserDecliningProductImages,
} from './aiAgentActionParse'

export type AgentExecutionStage =
  | 'idle'
  /** 方案已出，等待「确认执行」 */
  | 'awaiting_execute_confirm'
  /** 创建商品前等待用户附图或「自动生成」 */
  | 'awaiting_product_images'
  /** 至少一项场景预览已展示，各自独立确认 */
  | 'previews_active'

export type AgentExecutionPlan = {
  userBrief: string
  assistantContent: string
  taskTypes: AiTaskType[]
}

export type AgentExecutionState = {
  stage: AgentExecutionStage
  plan: AgentExecutionPlan | null
}

export function createAgentExecutionState(): AgentExecutionState {
  return { stage: 'idle', plan: null }
}

export function resetAgentExecutionState(): AgentExecutionState {
  return createAgentExecutionState()
}

export function buildCombinedBrief(plan: AgentExecutionPlan): string {
  return plan.assistantContent
    ? `${plan.userBrief}\n\n【方案要点】\n${plan.assistantContent.slice(0, 3500)}`
    : plan.userBrief
}

export function planFromDeferredContext(ctx: {
  userBrief: string
  assistantContent: string
  taskTypes: AiTaskType[]
}): AgentExecutionPlan {
  return {
    userBrief: ctx.userBrief,
    assistantContent: ctx.assistantContent,
    taskTypes: filterScenarioTaskTypes(ctx.taskTypes),
  }
}

/** 是否允许 LLM 新回复覆盖当前待执行方案 */
export function canAcceptDeferredPlan(state: AgentExecutionState): boolean {
  return state.stage === 'idle' || state.stage === 'awaiting_execute_confirm'
}

export function storeDeferredPlan(
  state: AgentExecutionState,
  userBrief: string,
  assistantContent: string,
  taskTypes: AiTaskType[],
): AgentExecutionState {
  const filtered = filterScenarioTaskTypes(taskTypes)
  if (!canAcceptDeferredPlan(state) || !filtered.length) return state
  return {
    stage: 'awaiting_execute_confirm',
    plan: planFromDeferredContext({ userBrief, assistantContent, taskTypes: filtered }),
  }
}

export function markAwaitingProductImages(state: AgentExecutionState): AgentExecutionState {
  if (!state.plan) return state
  return { ...state, stage: 'awaiting_product_images' }
}

export function markPreviewsActive(state: AgentExecutionState): AgentExecutionState {
  return { ...state, stage: 'previews_active' }
}

/** 若全部待确认预览已处理完，回到 idle */
export function syncStageAfterPreviewChange(
  state: AgentExecutionState,
  messages: AiAgentMessage[],
): AgentExecutionState {
  const hasPending = messages.some(
    (m) => m.role === 'task_preview' && (m.previewStatus ?? 'pending') === 'pending',
  )
  if (hasPending) return { ...state, stage: 'previews_active' }
  if (state.stage === 'previews_active' || state.stage === 'awaiting_product_images') {
    return { ...state, stage: 'idle', plan: null }
  }
  return state
}

export type ExecutionFlowAction =
  | { type: 'none' }
  | { type: 'prompt_upload_images' }
  | { type: 'start_parallel_previews'; plan: AgentExecutionPlan; taskTypes: AiTaskType[] }

export type ExecutionFlowResult = {
  state: AgentExecutionState
  action: ExecutionFlowAction
  assistantLine?: string
}

function needsProductImages(plan: AgentExecutionPlan, visionUrls: string[], strippedLine: string): boolean {
  return (
    plan.taskTypes.includes('create_product') &&
    visionUrls.length === 0 &&
    !isUserDecliningProductImages(strippedLine)
  )
}

/** 从计划中筛出尚未有待确认预览的任务类型 */
export function taskTypesNeedingPreview(
  plan: AgentExecutionPlan,
  messages: AiAgentMessage[],
): AiTaskType[] {
  return plan.taskTypes.filter((t) => !hasPendingPreviewForTask(messages, t))
}

export function resolveExecutionUserMessage(
  state: AgentExecutionState,
  messages: AiAgentMessage[],
  strippedLine: string,
  visionUrls: string[],
): ExecutionFlowResult {
  const plan = state.plan

  if (state.stage === 'awaiting_product_images' && plan) {
    if (
      visionUrls.length > 0 ||
      isUserDecliningProductImages(strippedLine) ||
      isExplicitExecutionIntent(strippedLine)
    ) {
      const taskTypes = taskTypesNeedingPreview(plan, messages)
      if (!taskTypes.length) {
        return { state: markPreviewsActive(state), action: { type: 'none' } }
      }
      return {
        state: markPreviewsActive(state),
        action: { type: 'start_parallel_previews', plan, taskTypes },
        assistantLine: '正在根据方案并行生成各场景执行预览，请分别在对应卡片确认…',
      }
    }
    return { state, action: { type: 'none' } }
  }

  if (
    (state.stage === 'awaiting_execute_confirm' || state.stage === 'previews_active') &&
    plan &&
    isExplicitExecutionIntent(strippedLine)
  ) {
    const taskTypes = taskTypesNeedingPreview(plan, messages)
    if (!taskTypes.length) {
      return {
        state,
        action: { type: 'none' },
        assistantLine: '当前方案下的场景预览已在对话中展示，请分别在对应卡片确认或修改。',
      }
    }

    if (needsProductImages(plan, visionUrls, strippedLine) && taskTypes.includes('create_product')) {
      return {
        state: markAwaitingProductImages(state),
        action: { type: 'prompt_upload_images' },
        assistantLine:
          '请上传商品图片（可多张），我将优化为主图与辅助图；若暂无图片，请回复「自动生成」。',
      }
    }

    return {
      state: markPreviewsActive(state),
      action: { type: 'start_parallel_previews', plan, taskTypes },
      assistantLine:
        taskTypes.length > 1
          ? `好的，将为 ${taskTypes.length} 项场景并行生成独立预览（${taskTypes.map(taskTypeLabel).join('、')}），请分别在各自卡片确认。`
          : '好的，正在生成执行预览…',
    }
  }

  return { state, action: { type: 'none' } }
}

function taskTypeLabel(t: AiTaskType): string {
  const map: Partial<Record<AiTaskType, string>> = {
    create_product: '创建商品',
    recruit_influencer: '招募达人',
    handle_review: '处理评价',
    sync_platform: '同步平台',
    analyze_exception: '分析异常',
    generate_copywriting: '生成文案',
    file_tax: '一键报税',
    optimize_local_ads: '优化本地推',
    follow_local_lead: '跟进线索',
  }
  return map[t] ?? t
}

export function inferDeferredTaskTypes(
  userText: string,
  assistantContent?: string,
  explicitTaskType?: AiTaskType,
): AiTaskType[] {
  return filterScenarioTaskTypes(
    inferTaskTypesFromCombinedContext(userText, assistantContent, explicitTaskType),
  )
}

/** 组合多场景方案须先「确认执行」，不自动弹出预览 */
export function shouldSkipAutoTaskPreview(
  _state: AgentExecutionState,
  userText: string,
  assistantContent?: string,
  explicitTaskType?: AiTaskType,
): boolean {
  const types = inferDeferredTaskTypes(userText, assistantContent, explicitTaskType)
  return types.length > 1
}
