import type { AiAgentMessage, AiPreviewStatus, AiTaskType } from './aiAgentTypes'
import { isProductPreviewLoading } from './aiAgentProductPlans'

/** 九大场景 + 报税：可独立预览确认的任务类型 */
export const AGENT_SCENARIO_TASK_TYPES: AiTaskType[] = [
  'create_product',
  'recruit_influencer',
  'handle_review',
  'optimize_local_ads',
  'follow_local_lead',
  'sync_platform',
  'analyze_exception',
  'generate_copywriting',
  'file_tax',
]

export function isPendingPreviewMessage(m: AiAgentMessage): boolean {
  return m.role === 'task_preview' && (m.previewStatus ?? 'pending') === 'pending'
}

export function listPendingPreviewMessages(messages: AiAgentMessage[]): AiAgentMessage[] {
  return messages.filter(isPendingPreviewMessage)
}

export function hasPendingPreviewForTask(
  messages: AiAgentMessage[],
  taskType: AiTaskType,
): boolean {
  return messages.some(
    (m) => isPendingPreviewMessage(m) && m.preview?.taskType === taskType,
  )
}

export function isPreviewMessageLoading(m: AiAgentMessage): boolean {
  const p = m.preview
  if (!p) return false
  if (p.taskType === 'create_product') return isProductPreviewLoading(p)
  if (p.taskType === 'recruit_influencer') return p.recruitmentBrief?.enrichStatus === 'loading'
  if (p.taskType === 'file_tax') return p.taxFiling?.enrichStatus === 'loading'
  return false
}

export function filterScenarioTaskTypes(taskTypes: AiTaskType[]): AiTaskType[] {
  const seen = new Set<AiTaskType>()
  const out: AiTaskType[] = []
  for (const t of taskTypes) {
    if (!AGENT_SCENARIO_TASK_TYPES.includes(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export function patchPreviewStatusInMessages(
  messages: AiAgentMessage[],
  msgId: string,
  previewStatus: AiPreviewStatus,
): AiAgentMessage[] {
  return messages.map((m) => (m.id === msgId ? { ...m, previewStatus } : m))
}
