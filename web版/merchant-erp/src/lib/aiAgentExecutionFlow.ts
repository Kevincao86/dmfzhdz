/**
 * AI 智能体执行流（对齐产品流程图）：
 * 用户输入 → 场景识别 → 给出方案+预览 → 用户确认/修改 → 调用接口 → 返回结果。
 * 多项九大场景任务可并行，每项各自独立预览确认窗口。
 */
import type { AiTaskType } from './aiAgentTypes'
import {
  filterScenarioTaskTypes,
  hasConfirmedPreviewForTask,
  hasPendingPreviewForTask,
} from './aiAgentPreviewState'
import type { AiAgentMessage } from './aiAgentTypes'
import {
  inferTaskTypesFromCombinedContext,
  isAgentShortcutTaskLine,
  isExplicitExecutionIntent,
  isInformationalOnlyQuery,
  isPlanOrNineScenarioQuery,
  isUserDecliningProductImages,
  planIncludesRecruitInfluencer,
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

/** 若全部待确认预览已处理完，且计划内各场景均已确认，才清空 plan */
export function syncStageAfterPreviewChange(
  state: AgentExecutionState,
  messages: AiAgentMessage[],
): AgentExecutionState {
  const hasPending = messages.some(
    (m) => m.role === 'task_preview' && (m.previewStatus ?? 'pending') === 'pending',
  )
  if (hasPending) return { ...state, stage: 'previews_active' }
  const plan = state.plan
  if (!plan) return state
  const allConfirmed = plan.taskTypes.every((t) => hasConfirmedPreviewForTask(messages, t))
  if (allConfirmed) return { stage: 'idle', plan: null }
  if (state.stage === 'previews_active' || state.stage === 'awaiting_product_images') {
    return { stage: 'awaiting_execute_confirm', plan }
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

/** 组合「商品+达人招募」时并行生成各自独立预览卡片（确认仍分卡片进行） */
export function taskTypesForNextPreviewBatch(
  plan: AgentExecutionPlan,
  messages: AiAgentMessage[],
): AiTaskType[] {
  return taskTypesNeedingPreview(plan, messages)
}

function isRecruitExecutionIntent(strippedLine: string): boolean {
  return /确认执行达人招募|确认发布达人招募|执行达人招募|达人招募流程也发|发一下达人招募/.test(
    strippedLine.replace(/\[引用[\s\S]*?\n\n/, '').trim(),
  )
}

/** 从对话历史恢复待执行方案（plan 被清空或页面刷新后仍可触发招募预览） */
export function recoverPlanFromMessages(messages: AiAgentMessage[]): AgentExecutionPlan | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const content = m.content ?? ''
    if (content.length < 80) continue
    if (!/活动|方案|套餐|组品|达人|招募|推广|618/.test(content)) continue
    let userBrief = ''
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j]?.role === 'user') {
        userBrief = messages[j].content?.replace(/\[引用[\s\S]*?\n\n/, '').trim() ?? ''
        break
      }
    }
    if (
      userBrief &&
      !isPlanOrNineScenarioQuery(userBrief) &&
      !isExplicitExecutionIntent(userBrief) &&
      !isAgentShortcutTaskLine(userBrief)
    ) {
      continue
    }
    if (isInformationalOnlyQuery(userBrief)) continue
    const taskTypes = filterScenarioTaskTypes(
      inferTaskTypesFromCombinedContext(userBrief, content, undefined),
    )
    if (!taskTypes.length) continue
    return { userBrief, assistantContent: content, taskTypes }
  }
  return null
}

export function resolveExecutionUserMessage(
  state: AgentExecutionState,
  messages: AiAgentMessage[],
  strippedLine: string,
  visionUrls: string[],
): ExecutionFlowResult {
  let plan = state.plan
  if (!plan && (isExplicitExecutionIntent(strippedLine) || isRecruitExecutionIntent(strippedLine))) {
    plan = recoverPlanFromMessages(messages)
    if (plan) {
      state = storeDeferredPlan(state, plan.userBrief, plan.assistantContent, plan.taskTypes)
    }
  }

  if (state.stage === 'awaiting_product_images' && plan) {
    if (
      visionUrls.length > 0 ||
      isUserDecliningProductImages(strippedLine) ||
      isExplicitExecutionIntent(strippedLine)
    ) {
      const taskTypes = taskTypesForNextPreviewBatch(plan, messages)
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
    (isExplicitExecutionIntent(strippedLine) || isRecruitExecutionIntent(strippedLine))
  ) {
    let taskTypes = taskTypesForNextPreviewBatch(plan, messages)
    if (isRecruitExecutionIntent(strippedLine) && planIncludesRecruitInfluencer(plan)) {
      if (!hasPendingPreviewForTask(messages, 'recruit_influencer')) {
        taskTypes = ['recruit_influencer']
      }
    }
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
          : taskTypes[0] === 'recruit_influencer'
            ? '好的，正在生成达人招募 Brief 预览…'
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
