/**
 * ERP 租户 AI 积分经济（独立于星选 mp 积分账本，单价与星选共用）。
 * 60% 毛利：用户支付价中 40% 覆盖 AI 成本（1 积分 = ¥0.01 内部成本）。
 */
import type { MembershipPlan } from './membershipPlan.js'
import { MEMBERSHIP_MONTHLY_YUAN } from './membershipPlan.js'
import {
  MP_POINT_AI_COST_SHARE,
  MP_POINT_INTERNAL_COST_YUAN,
  MP_POINTS_VIDEO_PER_MIN,
  MP_POINTS_ARTICLE_PER_USE,
  MP_POINTS_BRIEF_PER_USE,
} from './mpPointsEconomics.js'

/**
 * 智能体对话预检下限。实际扣费按 token 成本、毛利 60%（1 积分覆盖 ¥0.01 AI 成本）。
 */
export const ERP_AGENT_POINTS_PER_TURN = 1

/** 按模型公开价（元 / 千 token）估算对话成本，再按 60% 毛利换成积分 */
export function erpAgentPointsFromTokenUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
  model?: string | null,
): number {
  const prompt = Math.max(0, Math.floor(Number(usage?.prompt_tokens) || 0))
  const completion = Math.max(0, Math.floor(Number(usage?.completion_tokens) || 0))
  if (prompt + completion <= 0) return ERP_AGENT_POINTS_PER_TURN
  const m = String(model || '').toLowerCase()
  let inPerK = 0.0008
  let outPerK = 0.002
  if (/flash|turbo/.test(m)) {
    inPerK = 0.0003
    outPerK = 0.0006
  } else if (/max/.test(m)) {
    inPerK = 0.0024
    outPerK = 0.0096
  } else if (/mini|haiku/.test(m)) {
    inPerK = 0.001
    outPerK = 0.004
  } else if (/gpt-4o|claude|gemini|grok/.test(m)) {
    inPerK = 0.02
    outPerK = 0.06
  }
  const costYuan = (prompt / 1000) * inPerK + (completion / 1000) * outPerK
  return Math.max(1, Math.ceil(costYuan / MP_POINT_INTERNAL_COST_YUAN))
}

export const ERP_AGENT_USAGE_KIND = 'agent' as const
export type ErpAgentUsageKind = typeof ERP_AGENT_USAGE_KIND

export const ERP_POINT_INTERNAL_COST_YUAN = MP_POINT_INTERNAL_COST_YUAN

/** 目标毛利率 */
export const ERP_POINT_GROSS_MARGIN = 0.6

/** 用户支付价中用于 AI 成本的比例（其余 60% 为毛利） */
export const ERP_POINT_AI_COST_SHARE = MP_POINT_AI_COST_SHARE
/** @deprecated 请用 ERP_POINT_AI_COST_SHARE */
export const ERP_POINT_PROFIT_MARGIN = ERP_POINT_AI_COST_SHARE

/** 免费注册一次性赠送 */
export const ERP_BASIC_GIFT_POINTS = 100

/** 充值：60% 毛利 → ¥1 = 40 积分 */
export const ERP_RECHARGE_POINTS_PER_YUAN = Math.floor(
  ERP_POINT_AI_COST_SHARE / ERP_POINT_INTERNAL_COST_YUAN,
)

/** 月付价（元）→ 月赠积分（60% 毛利，未取整） */
export function computeErpMonthlyGiftFromYuan(monthlyYuan: number): number {
  const y = Number(monthlyYuan)
  if (!Number.isFinite(y) || y <= 0) return 0
  return Math.floor((y * ERP_POINT_AI_COST_SHARE) / ERP_POINT_INTERNAL_COST_YUAN)
}

/** 各会员档位月赠积分（套餐桶，自然月刷新） */
export const ERP_MONTHLY_GIFT_POINTS: Record<MembershipPlan, number> = {
  free: ERP_BASIC_GIFT_POINTS,
  member: computeErpMonthlyGiftFromYuan(MEMBERSHIP_MONTHLY_YUAN.member ?? 168),
  member_plus: computeErpMonthlyGiftFromYuan(MEMBERSHIP_MONTHLY_YUAN.member_plus ?? 598),
}

export type ErpPointsRechargeTier = {
  label: string
  yuan: number
  points: number
  listPriceYuan?: number
}

export const ERP_POINTS_RECHARGE_TIERS: ErpPointsRechargeTier[] = [
  { label: '体验包', yuan: 10, points: computeErpRechargePoints(10) },
  { label: '标准包', yuan: 49, points: 2000, listPriceYuan: 50 },
  { label: '进阶包', yuan: 99, points: 4000, listPriceYuan: 120 },
  { label: '团队包', yuan: 499, points: 20000, listPriceYuan: 600 },
]

export function computeErpRechargePoints(yuan: number): number {
  const y = Number(yuan)
  if (!Number.isFinite(y) || y <= 0) return 0
  return Math.floor(y * ERP_RECHARGE_POINTS_PER_YUAN)
}

export function computeErpRechargePointsFromCents(cents: number): number {
  return computeErpRechargePoints(cents / 100)
}

export function erpPointsEquivalents(points: number): {
  videoMinutes: number
  articleUses: number
  briefUses: number
} {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  return {
    videoMinutes: Math.floor(p / MP_POINTS_VIDEO_PER_MIN),
    articleUses: Math.floor(p / MP_POINTS_ARTICLE_PER_USE),
    briefUses: Math.floor(p / MP_POINTS_BRIEF_PER_USE),
  }
}

export function formatErpPointsEquivalentsLine(points: number): string {
  const eq = erpPointsEquivalents(points)
  return `约 ${eq.videoMinutes} 分钟视频检核 · ${eq.articleUses} 次文稿 · ${eq.briefUses} 篇 Brief`
}

export function erpMonthlyGiftPointsForPlan(plan: MembershipPlan): number {
  return ERP_MONTHLY_GIFT_POINTS[plan] ?? ERP_BASIC_GIFT_POINTS
}

export function shanghaiYearMonth(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  return `${y}-${m}`
}
