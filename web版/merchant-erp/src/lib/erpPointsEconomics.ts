/**
 * ERP 租户 AI 积分经济（独立于星选 mp 积分）。
 * 60% 毛利：用户支付价中 40% 用于覆盖 AI 成本（1 积分 = ¥0.01 内部成本）。
 */
import type { MembershipPlan } from './membershipPlan.js'
import { MP_POINTS_VIDEO_PER_MIN, MP_POINTS_ARTICLE_PER_USE, MP_POINTS_BRIEF_PER_USE } from './mpPointsEconomics.js'

export const ERP_POINT_INTERNAL_COST_YUAN = 0.01

/** 订阅价 / 充值价中用于 AI 成本的比例（其余 60% 为毛利） */
export const ERP_POINT_PROFIT_MARGIN = 0.4

/** 免费注册一次性赠送 */
export const ERP_BASIC_GIFT_POINTS = 100

/** 充值：60% 毛利 → ¥1 = 40 积分 */
export const ERP_RECHARGE_POINTS_PER_YUAN = Math.floor(
  ERP_POINT_PROFIT_MARGIN / ERP_POINT_INTERNAL_COST_YUAN,
)

/** 各会员档位月赠积分（套餐桶，自然月刷新） */
export const ERP_MONTHLY_GIFT_POINTS: Record<MembershipPlan, number> = {
  free: ERP_BASIC_GIFT_POINTS,
  member: 6500,
  member_plus: 23000,
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
