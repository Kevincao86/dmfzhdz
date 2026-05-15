/** 与 web版 merchant-erp/src/lib/meooPaymentTiers.ts 档位保持一致 */

module.exports = {
  SUBSCRIPTION_TIERS: [
    { label: '月度 · 30 天', yuan: 99, cents: 9900 },
    { label: '季度 · 90 天', yuan: 268, cents: 26800 },
    { label: '年度 · 365 天', yuan: 698, cents: 69800 },
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
