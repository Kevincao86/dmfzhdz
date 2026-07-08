/** 订阅会员 — 套餐对比表 */
const TIERS = [
  { id: 'basic', label: '基础版', plan: 'free' },
  { id: 'pro', label: '专业版', plan: 'member' },
  { id: 'flagship', label: '旗舰版', plan: 'member_plus' },
]

const FEATURE_ROWS = [
  { key: 'core', label: '核心功能', icon: '⚡', basic: '基础功能', pro: '全部功能', flagship: '全部功能+' },
  { key: 'quota', label: '使用额度', icon: '📊', basic: '1万条/月', pro: '10万条/月', flagship: '不限' },
  { key: 'storage', label: '云存储', icon: '☁', basic: '5 GB', pro: '50 GB', flagship: '200 GB' },
  { key: 'team', label: '团队成员', icon: '👥', basic: '1 人', pro: '5 人', flagship: '不限' },
  { key: 'support', label: '优先支持', icon: '🎧', basic: '—', pro: '✓', flagship: '✓' },
  { key: 'perm', label: '高级权限', icon: '🔐', basic: '—', pro: '✓', flagship: '✓' },
]

function planToTierId(plan) {
  if (plan === 'member_plus') return 'flagship'
  if (plan === 'member') return 'pro'
  return 'basic'
}

function tierLabel(plan) {
  const id = planToTierId(plan)
  const row = TIERS.find((t) => t.id === id)
  return row ? row.label : '基础版'
}

function buildTable(activeTierId) {
  return FEATURE_ROWS.map((row) => ({
    ...row,
    cells: [
      { tierId: 'basic', text: row.basic, highlight: activeTierId === 'basic', check: row.basic === '✓' },
      { tierId: 'pro', text: row.pro, highlight: activeTierId === 'pro', check: row.pro === '✓' },
      { tierId: 'flagship', text: row.flagship, highlight: activeTierId === 'flagship', check: row.flagship === '✓' },
    ],
  }))
}

module.exports = {
  TIERS,
  FEATURE_ROWS,
  planToTierId,
  tierLabel,
  buildTable,
}
