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

/** 免费版直连四厂商每月上限 */
export const FREE_DIRECT_AI_CALL_LIMIT = 50

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
  directAiCallsUsed: number
  directAiCallLimit: number | null
  directAiRemaining: number | null
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
    directAiCallsUsed: used,
    directAiCallLimit: limit,
    directAiRemaining: remaining,
    tokenMixBound: !!input.tokenMixBound,
    features: {
      geo: !isFree,
      competitorAnalysis: !isFree,
      financeTax: !isFree,
      allAiModels: plan === 'member_plus',
    },
  }
}
