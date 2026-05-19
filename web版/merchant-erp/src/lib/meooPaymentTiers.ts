/** 订阅 / 充值档位（与扫码示意一致）；金额单位：分 */

import type { MembershipPlan } from './membershipPlan'

export type PaymentTier = { label: string; yuan: number; cents: number; plan?: MembershipPlan }

export const SUBSCRIPTION_TIERS: PaymentTier[] = [
  { label: '会员版 · 月度', yuan: 168, cents: 16800, plan: 'member' },
  { label: '会员 Plus · 月度', yuan: 598, cents: 59800, plan: 'member_plus' },
  { label: '会员版 · 季度', yuan: 468, cents: 46800, plan: 'member' },
  { label: '会员 Plus · 季度', yuan: 1688, cents: 168800, plan: 'member_plus' },
]

export const RECHARGE_TIERS: PaymentTier[] = [
  { label: '¥100', yuan: 100, cents: 10000 },
  { label: '¥300', yuan: 300, cents: 30000 },
  { label: '¥500', yuan: 500, cents: 50000 },
]

/** 自定义金额（元）→ 分，最少 ¥1 */
export function yuanInputToCents(yuanStr: string): number | null {
  const n = Number(String(yuanStr).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 1) return null
  return Math.round(n * 100)
}

/** 退款金额（元）→ 分，最少 ¥0.01 */
export function yuanRefundInputToCents(yuanStr: string): number | null {
  const n = Number(String(yuanStr).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n <= 0) return null
  const cents = Math.round(n * 100)
  return cents >= 1 ? cents : null
}

/** 订阅确认：按档位精确匹配；否则按 ¥99≈30 天比例折算（至少 1 天） */
export function subscriptionDaysFromVerifiedCents(verifiedCents: number): number {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return 0
  for (const t of SUBSCRIPTION_TIERS) {
    if (t.cents === verifiedCents) {
      if (t.cents === 16800 || t.cents === 59800) return 30
      if (t.cents === 46800 || t.cents === 168800) return 90
    }
  }
  const unit = 16800 / 30
  return Math.max(1, Math.floor(verifiedCents / unit))
}

/** 运营确认订阅到账后，按核对金额落位会员档位（与 SUBSCRIPTION_TIERS 一致） */
export function membershipPlanFromVerifiedCents(verifiedCents: number): MembershipPlan | null {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return null
  for (const t of SUBSCRIPTION_TIERS) {
    if (t.cents === verifiedCents && t.plan) return t.plan
  }
  if (verifiedCents >= 59800) return 'member_plus'
  if (verifiedCents >= 16800) return 'member'
  return null
}

/** 充值到账金额 = 核对金额（分） */
export function rechargeCreditFromVerifiedCents(verifiedCents: number): number {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return 0
  return Math.floor(verifiedCents)
}

export function formatYuanFromCents(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
