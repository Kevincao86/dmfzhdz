/** 与 web版 merchant-erp/src/lib/meooPaymentTiers.ts 档位保持一致 */

const ERP_RECHARGE_POINTS_PER_YUAN = 50

function computeErpRechargePoints(yuan) {
  const y = Number(yuan)
  if (!Number.isFinite(y) || y <= 0) return 0
  return Math.floor(y * ERP_RECHARGE_POINTS_PER_YUAN)
}

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
  POINTS_RECHARGE_TIERS: [
    { label: '体验包', yuan: 10, cents: 1000, points: computeErpRechargePoints(10) },
    { label: '标准包', yuan: 49, cents: 4900, points: 2500 },
    { label: '进阶包', yuan: 99, cents: 9900, points: 5000 },
    { label: '团队包', yuan: 499, cents: 49900, points: 25000 },
  ].map((t) => ({
    ...t,
    label: `${t.label} · ${t.points.toLocaleString('zh-CN')}积分`,
  })),
  TENANT_ONLINE_PAY_TTL_MS: 5 * 60 * 1000,
  TENANT_ONLINE_PAY_TTL_SEC: 5 * 60,
  ERP_RECHARGE_POINTS_PER_YUAN,
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
