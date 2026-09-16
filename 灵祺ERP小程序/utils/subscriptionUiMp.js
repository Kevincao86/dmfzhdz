/** 订阅对比 — 与网页版 SubscriptionPlansPanel / membershipPlan 对齐（免费版 / 会员版 / 会员 Plus） */

const TIERS = [
  { id: 'free', label: '免费版', plan: 'free', price: '永久' },
  { id: 'member', label: '会员版', plan: 'member', price: '¥168/月起' },
  { id: 'member_plus', label: '会员 Plus', plan: 'member_plus', price: '¥598/月起' },
]

/** 月赠积分：168×40、598×40，与 erpPointsEconomics.ERP_MONTHLY_GIFT_POINTS 一致 */
const FEATURE_ROWS = [
  {
    key: 'core',
    label: '经营能力',
    icon: '⚡',
    free: '商品 / 店铺 / 招募基础',
    member: 'GEO · 竞对分析 · 报税管理',
    member_plus: '代运营多店 + 全功能',
  },
  {
    key: 'bind',
    label: '平台账号绑定',
    icon: '🔗',
    free: '每平台 1 个',
    member: '每平台 5 个',
    member_plus: '每平台 50 个',
  },
  {
    key: 'ai_chat',
    label: '直连 AI 对话',
    icon: '💬',
    free: '50 次/月（四厂商）',
    member: '不限（四厂商）',
    member_plus: '不限（含 OpenAI / Claude）',
  },
  {
    key: 'media',
    label: 'AI 生图 / 生视频',
    icon: '🎬',
    free: '可预览，使用需升级',
    member: '生图 · 短视频 · 数字人 · 混剪',
    member_plus: '短视频 / 云剪 / 数字人',
  },
  {
    key: 'leads',
    label: '投放与线索',
    icon: '📈',
    free: '—',
    member: '本地推优化 + 线索跟进 AI',
    member_plus: '一键报税 AI',
  },
  {
    key: 'gift',
    label: 'AI 积分',
    icon: '✦',
    free: '注册赠 100 积分',
    member: '每月 6,720 积分（套餐桶）',
    member_plus: '每月 23,920 积分（套餐桶）',
  },
]

function planToTierId(plan) {
  if (plan === 'member_plus') return 'member_plus'
  if (plan === 'member') return 'member'
  return 'free'
}

function tierLabel(plan) {
  const id = planToTierId(plan)
  const row = TIERS.find((t) => t.id === id)
  return row ? row.label : '免费版'
}

function cellCheck(text) {
  const t = String(text || '')
  return t === '✓' || (t !== '—' && t.indexOf('需升级') < 0)
}

function buildTable(activeTierId) {
  return FEATURE_ROWS.map((row) => ({
    ...row,
    cells: [
      { tierId: 'free', text: row.free, highlight: activeTierId === 'free', check: false },
      { tierId: 'member', text: row.member, highlight: activeTierId === 'member', check: cellCheck(row.member) },
      {
        tierId: 'member_plus',
        text: row.member_plus,
        highlight: activeTierId === 'member_plus',
        check: cellCheck(row.member_plus),
      },
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
