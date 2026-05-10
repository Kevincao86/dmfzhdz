/** 与 web版/merchant-erp/src/lib/meooPaymentTiers.ts 公式保持一致 */

const SUBSCRIPTION_TIER_CENTS = new Map<number, number>([
  [9900, 30],
  [26800, 90],
  [69800, 365],
])

export function subscriptionDaysFromVerifiedCents(verifiedCents: number): number {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return 0
  const hit = SUBSCRIPTION_TIER_CENTS.get(verifiedCents)
  if (hit !== undefined) return hit
  const unit = 9900 / 30
  return Math.max(1, Math.floor(verifiedCents / unit))
}

export function rechargeCreditFromVerifiedCents(verifiedCents: number): number {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return 0
  return Math.floor(verifiedCents)
}
