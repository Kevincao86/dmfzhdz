/** 租户权益天数：订阅权益 + 运营赠送 = 总权益；service_expire_at 随天数变更顺延 */

export function clampEntitlementDays(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(36500, Math.floor(n)))
}

export function totalEntitlementDays(subscriptionDays: number, opsGiftDays: number): number {
  return clampEntitlementDays(subscriptionDays) + clampEntitlementDays(opsGiftDays)
}

export function extendServiceExpireAtIso(
  currentIso: string | null | undefined,
  addDays: number,
): string {
  const days = clampEntitlementDays(addDays)
  if (days <= 0) {
    if (currentIso && String(currentIso).trim()) {
      const d = new Date(String(currentIso))
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    }
    return new Date().toISOString()
  }
  const nowMs = Date.now()
  let baseMs = nowMs
  if (currentIso != null && String(currentIso).trim()) {
    const se = new Date(String(currentIso)).getTime()
    if (Number.isFinite(se) && se > baseMs) baseMs = se
  }
  return new Date(baseMs + days * 86400000).toISOString()
}

export function readEntitlementDays(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return clampEntitlementDays(n)
}

/** 订单确认：累加订阅天数并顺延截止日 */
export function buildSubscriptionPurchasePatch(input: {
  subscriptionDays: number
  opsGiftDays: number
  serviceExpireAt: string | null
  purchasedDays: number
}): {
  subscription_days: number
  ops_gift_days: number
  official_days: number
  service_expire_at: string
} {
  const purchased = clampEntitlementDays(input.purchasedDays)
  const gift = clampEntitlementDays(input.opsGiftDays)
  const sub = clampEntitlementDays(input.subscriptionDays) + purchased
  return {
    subscription_days: sub,
    ops_gift_days: gift,
    official_days: totalEntitlementDays(sub, gift),
    service_expire_at: extendServiceExpireAtIso(input.serviceExpireAt, purchased),
  }
}

/** 运营仅改赠送天数：总权益与截止日按差额顺延 */
export function buildOpsGiftDaysPatch(input: {
  subscriptionDays: number
  oldOpsGiftDays: number
  newOpsGiftDays: number
  serviceExpireAt: string | null
}): {
  subscription_days: number
  ops_gift_days: number
  official_days: number
  service_expire_at: string
} {
  const sub = clampEntitlementDays(input.subscriptionDays)
  const oldGift = clampEntitlementDays(input.oldOpsGiftDays)
  const newGift = clampEntitlementDays(input.newOpsGiftDays)
  const delta = newGift - oldGift
  const service_expire_at =
    delta !== 0
      ? extendServiceExpireAtIso(input.serviceExpireAt, delta)
      : input.serviceExpireAt && String(input.serviceExpireAt).trim()
        ? new Date(String(input.serviceExpireAt)).toISOString()
        : extendServiceExpireAtIso(null, totalEntitlementDays(sub, newGift))
  return {
    subscription_days: sub,
    ops_gift_days: newGift,
    official_days: totalEntitlementDays(sub, newGift),
    service_expire_at,
  }
}
