/** 与 web版/merchant-erp/src/lib/meooPaymentTiers.ts 公式保持一致 */

export type OpsMembershipPlan = 'free' | 'member' | 'member_plus'

const SUBSCRIPTION_TIER_CENTS = new Map<number, number>([
  [16800, 30],
  [59800, 30],
  [46800, 90],
  [168800, 90],
])

const SUBSCRIPTION_TIER_PLAN = new Map<number, OpsMembershipPlan>([
  [16800, 'member'],
  [59800, 'member_plus'],
  [46800, 'member'],
  [168800, 'member_plus'],
])

export function subscriptionDaysFromVerifiedCents(verifiedCents: number): number {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return 0
  const hit = SUBSCRIPTION_TIER_CENTS.get(verifiedCents)
  if (hit !== undefined) return hit
  const unit = 16800 / 30
  return Math.max(1, Math.floor(verifiedCents / unit))
}

export function membershipPlanFromVerifiedCents(verifiedCents: number): OpsMembershipPlan | null {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return null
  const hit = SUBSCRIPTION_TIER_PLAN.get(verifiedCents)
  if (hit) return hit
  if (verifiedCents >= 59800) return 'member_plus'
  if (verifiedCents >= 16800) return 'member'
  return null
}

export function rechargeCreditFromVerifiedCents(verifiedCents: number): number {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return 0
  return Math.floor(verifiedCents)
}
