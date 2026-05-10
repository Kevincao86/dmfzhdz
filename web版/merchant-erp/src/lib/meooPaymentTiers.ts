/** 订阅 / 充值档位（与扫码示意一致）；金额单位：分 */

export type PaymentTier = { label: string; yuan: number; cents: number }

export const SUBSCRIPTION_TIERS: PaymentTier[] = [
  { label: '月度 · 30 天', yuan: 99, cents: 9900 },
  { label: '季度 · 90 天', yuan: 268, cents: 26800 },
  { label: '年度 · 365 天', yuan: 698, cents: 69800 },
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
      if (t.cents === 9900) return 30
      if (t.cents === 26800) return 90
      if (t.cents === 69800) return 365
    }
  }
  const unit = 9900 / 30
  return Math.max(1, Math.floor(verifiedCents / unit))
}

/** 充值到账金额 = 核对金额（分） */
export function rechargeCreditFromVerifiedCents(verifiedCents: number): number {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return 0
  return Math.floor(verifiedCents)
}

export function formatYuanFromCents(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
