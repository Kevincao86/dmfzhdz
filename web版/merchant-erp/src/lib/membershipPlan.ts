/** 租户会员档位（与 public.tenants.membership_plan 一致） */
export type MembershipPlan = 'free' | 'member' | 'member_plus'

export const MEMBERSHIP_PLAN_LABELS: Record<MembershipPlan, string> = {
  free: '免费版',
  member: '会员版',
  member_plus: '会员 Plus',
}

export const MEMBERSHIP_MONTHLY_YUAN: Partial<Record<MembershipPlan, number>> = {
  member: 168,
  member_plus: 598,
}

import { MP_POINTS_ARTICLE_PER_USE } from './mpPointsEconomics.js'

/** 免费版直连四厂商每月上限 */
export const FREE_DIRECT_AI_CALL_LIMIT = 50

/** 付费版智能体每轮对话积分（与文稿检核同档） */
export const ERP_AGENT_POINTS_PER_TURN = MP_POINTS_ARTICLE_PER_USE

/** 各会员档位：抖音来客 / 巨量本地推 每平台可绑定账号数 */
export function platformBindingLimit(plan: MembershipPlan): number {
  if (plan === 'member_plus') return 50
  if (plan === 'member') return 5
  return 1
}

export function platformBindingLimitDescription(plan: MembershipPlan): string {
  const n = platformBindingLimit(plan)
  return `${MEMBERSHIP_PLAN_LABELS[plan]}：每个平台最多绑定 ${n} 个账号`
}

export function canAddPlatformBinding(plan: MembershipPlan, currentCount: number): boolean {
  return currentCount < platformBindingLimit(plan)
}

export function platformBindingLimitExceededMessage(plan: MembershipPlan): string {
  const n = platformBindingLimit(plan)
  const label = MEMBERSHIP_PLAN_LABELS[plan]
  if (plan === 'free') {
    return `${label}每个平台仅可绑定 1 个账号。如需绑定更多，请升级会员版（5 个）或会员 Plus（50 个）。`
  }
  if (plan === 'member') {
    return `${label}每个平台最多绑定 ${n} 个账号。如需更多，请升级会员 Plus（50 个）。`
  }
  return `${label}每个平台最多绑定 ${n} 个账号。`
}

/** 会员版 / 免费版可选 AI 厂商（不含 TokenMix、Kimi） */
export const BASIC_AI_PROVIDERS = ['qwen', 'doubao', 'minimax', 'deepseek'] as const
export type BasicAiProvider = (typeof BASIC_AI_PROVIDERS)[number]

export function normalizeMembershipPlan(raw: unknown): MembershipPlan {
  if (raw === 'free' || raw === 'member' || raw === 'member_plus') return raw
  return 'member'
}

export function membershipAllowsTokenMix(plan: MembershipPlan): boolean {
  return plan === 'member_plus'
}

export function membershipAllowsProvider(plan: MembershipPlan, provider: string): boolean {
  const p = provider.trim().toLowerCase()
  if (membershipAllowsTokenMix(plan)) return true
  return (BASIC_AI_PROVIDERS as readonly string[]).includes(p)
}

/** 免费版不可用的 ERP 功能路径 */
export const FREE_BLOCKED_PATHS = [
  '/geo',
  '/operation/competitors',
  '/finance/tax',
] as const

export function isPathBlockedForFree(pathname: string): boolean {
  return FREE_BLOCKED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export type TenantEntitlements = {
  plan: MembershipPlan
  planLabel: string
  /** 来客 / 本地推每平台账号上限 */
  platformBindingLimit: number
  directAiCallsUsed: number
  directAiCallLimit: number | null
  directAiRemaining: number | null
  /** 付费版智能体：每轮对话积分扣费；免费版为 null */
  agentPointsPerTurn: number | null
  tokenMixBound: boolean
  features: {
    geo: boolean
    competitorAnalysis: boolean
    financeTax: boolean
    allAiModels: boolean
  }
}

export function buildTenantEntitlements(input: {
  plan: MembershipPlan
  directAiCallsUsed?: number
  tokenMixBound?: boolean
}): TenantEntitlements {
  const plan = input.plan
  const used = Math.max(0, Math.floor(input.directAiCallsUsed ?? 0))
  const isFree = plan === 'free'
  const limit = isFree ? FREE_DIRECT_AI_CALL_LIMIT : null
  const remaining = limit != null ? Math.max(0, limit - used) : null
  return {
    plan,
    planLabel: MEMBERSHIP_PLAN_LABELS[plan],
    platformBindingLimit: platformBindingLimit(plan),
    directAiCallsUsed: used,
    directAiCallLimit: limit,
    directAiRemaining: remaining,
    agentPointsPerTurn: isFree ? null : ERP_AGENT_POINTS_PER_TURN,
    tokenMixBound: !!input.tokenMixBound,
    features: {
      geo: !isFree,
      competitorAnalysis: !isFree,
      financeTax: !isFree,
      allAiModels: plan === 'member_plus',
    },
  }
}
