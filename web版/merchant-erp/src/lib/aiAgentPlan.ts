import type { AiPermissionId, AiTaskType } from './aiAgentTypes'
import { AI_AGENT_SHORTCUTS } from './aiAgentTypes'
import type { MembershipPlan } from './membershipPlan'
import { MEMBERSHIP_PLAN_LABELS } from './membershipPlan'

export type AiAgentPlanProfile = {
  plan: MembershipPlan
  planLabel: string
  tierTag: string
  welcome: string
  composerHint: string
  shortcuts: { type: AiTaskType; label: string }[]
  permissions: Record<AiPermissionId, boolean>
}

const BASE_WELCOME =
  '你好，我是墨典 AI 助手。先在输入框右侧选好模型（对话或文生图），再描述任务；涉及改商品、发招募单、报税、发布等操作会先展示预览，**需您确认后**才会调用业务接口。'

const WELCOME_BY_PLAN: Record<MembershipPlan, string> = {
  free: `${BASE_WELCOME}\n\n当前为 **免费版**：可使用豆包/千问/MiniMax/DeepSeek 对话与文生图（每月直连调用 ${50} 次上限）；报税管理、GEO、竞对分析需升级会员。`,
  member: `${BASE_WELCOME}\n\n当前为 **会员版**：可使用四厂商对话模型；生图时若您选的是豆包等对话模型，系统会自动切换为对应文生图引擎优化出图。`,
  member_plus: `${BASE_WELCOME}\n\n当前为 **会员 Plus**：可使用全部对话与文生图模型（含 TokenMix 多模型）；复杂任务与一键报税均已开放。`,
}

function shortcutsForPlan(plan: MembershipPlan) {
  const blocked = new Set<AiTaskType>()
  if (plan === 'free') {
    blocked.add('file_tax')
    blocked.add('optimize_local_ads')
    blocked.add('follow_local_lead')
  }
  return AI_AGENT_SHORTCUTS.filter((s) => !blocked.has(s.type))
}

function permissionsForPlan(plan: MembershipPlan): Record<AiPermissionId, boolean> {
  const isFree = plan === 'free'
  return {
    product: true,
    store: true,
    influencer: true,
    review: true,
    sync: true,
    local_ads: !isFree,
    local_leads: !isFree,
    finance_tax: !isFree,
  }
}

export function buildAiAgentPlanProfile(plan: MembershipPlan): AiAgentPlanProfile {
  return {
    plan,
    planLabel: MEMBERSHIP_PLAN_LABELS[plan],
    tierTag: plan === 'member_plus' ? 'Plus' : plan === 'member' ? '会员' : '免费',
    welcome: WELCOME_BY_PLAN[plan],
    composerHint:
      plan === 'free'
        ? '免费版：对话与生图可用；报税/GEO 等请升级会员'
        : '选对话模型即可；生图需求将自动匹配文生图模型',
    shortcuts: shortcutsForPlan(plan),
    permissions: permissionsForPlan(plan),
  }
}

export function membershipAllowsAiTask(plan: MembershipPlan, task: AiTaskType): boolean {
  if (plan === 'free' && task === 'file_tax') return false
  if (plan === 'free' && (task === 'optimize_local_ads' || task === 'follow_local_lead')) return false
  return true
}

export function aiTaskConfirmLabel(taskType: AiTaskType | null): string {
  switch (taskType) {
    case 'create_product':
      return '确认商品方案'
    case 'recruit_influencer':
      return '确认并下达招募订单'
    case 'file_tax':
      return '确认并一键报税'
    default:
      return '确认执行'
  }
}
