/** 与 web版 merchant-erp/src/lib/meooPaymentTiers.ts 档位保持一致 */

module.exports = {
  SUBSCRIPTION_TIERS: [
    { label: '会员版 · 月度', yuan: 168, cents: 16800, plan: 'member' },
    { label: '会员 Plus · 月度', yuan: 598, cents: 59800, plan: 'member_plus' },
    { label: '会员版 · 季度', yuan: 468, cents: 46800, plan: 'member' },
    { label: '会员 Plus · 季度', yuan: 1688, cents: 168800, plan: 'member_plus' },
  ],
  RECHARGE_TIERS: [
    { label: '¥100', yuan: 100, cents: 10000 },
    { label: '¥300', yuan: 300, cents: 30000 },
    { label: '¥500', yuan: 500, cents: 50000 },
  ],
  yuanInputToCents(yuanStr) {
    const n = Number(String(yuanStr || '').replace(/,/g, '').trim())
    if (!Number.isFinite(n) || n < 1) return null
    return Math.round(n * 100)
  },
  yuanRefundInputToCents(yuanStr) {
    const n = Number(String(yuanStr || '').replace(/,/g, '').trim())
    if (!Number.isFinite(n) || n <= 0) return null
    const cents = Math.round(n * 100)
    return cents >= 1 ? cents : null
  },
  formatYuanFromCents(cents) {
    return (cents / 100).toFixed(2)
  },
}
