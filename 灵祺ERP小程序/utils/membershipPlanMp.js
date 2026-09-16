/** 与 web版 merchant-erp/src/lib/membershipPlan.ts 对齐 */

const MEMBERSHIP_PLAN_LABELS = {
  free: '免费版',
  member: '会员版',
  member_plus: '会员 Plus',
}

const MEMBERSHIP_MONTHLY_YUAN = {
  member: 168,
  member_plus: 598,
}

const FREE_DIRECT_AI_CALL_LIMIT = 50

const PLAN_FEATURE_LINES = {
  free: [
    '商品 / 店铺 / 招募基础',
    '每平台绑定 1 个账号',
    '直连 AI 对话 50 次/月（四厂商）',
    '可预览生图 / 生视频，使用需升级',
    '注册赠 100 积分',
  ],
  member: [
    'GEO 优化 · 竞对分析 · 报税管理',
    '每平台绑定 5 个账号',
    '直连 AI 不限（四厂商）',
    'AI 生图 · 短视频 · 数字人 · 混剪',
    '本地推优化 + 线索跟进 AI',
    '每月 6,720 积分（套餐桶）',
  ],
  member_plus: [
    '全部 AI 模型（含 OpenAI / Claude）',
    '每平台绑定 50 个账号',
    '一键报税 AI · 代运营多店',
    '每月 23,920 积分（套餐桶）',
    '短视频 / 云剪 / 数字人可用',
  ],
}

function normalizePlan(raw) {
  if (raw === 'free' || raw === 'member' || raw === 'member_plus') return raw
  return 'free'
}

function buildEntitlements(plan, directAiCallsUsed) {
  const used = Math.max(0, Math.floor(Number(directAiCallsUsed) || 0))
  const isFree = plan === 'free'
  const limit = isFree ? FREE_DIRECT_AI_CALL_LIMIT : null
  const remaining = limit != null ? Math.max(0, limit - used) : null
  return {
    plan,
    planLabel: MEMBERSHIP_PLAN_LABELS[plan],
    directAiCallsUsed: used,
    directAiCallLimit: limit,
    directAiRemaining: remaining,
    monthlyYuan: MEMBERSHIP_MONTHLY_YUAN[plan] != null ? MEMBERSHIP_MONTHLY_YUAN[plan] : null,
    featureLines: PLAN_FEATURE_LINES[plan] || PLAN_FEATURE_LINES.free,
    isPaid: plan === 'member' || plan === 'member_plus',
  }
}

function parseServiceExpireAt(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return null
    const d = new Date(t)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return null
}

function computeMemberUsageRemaining(serviceExpireAtIso) {
  const expireAtIso = parseServiceExpireAt(serviceExpireAtIso)
  if (!expireAtIso) {
    return { expireAtIso: null, remainDays: null, expireText: '' }
  }
  const expireDate = new Date(expireAtIso)
  if (Number.isNaN(expireDate.getTime())) {
    return { expireAtIso: null, remainDays: null, expireText: '' }
  }
  const remainDays = Math.ceil((expireDate.getTime() - Date.now()) / 86400000)
  let expireText = ''
  try {
    expireText = expireDate.toLocaleString('zh-CN', { hour12: false })
  } catch (_) {
    expireText = expireAtIso
  }
  return { expireAtIso, remainDays, expireText }
}

module.exports = {
  MEMBERSHIP_PLAN_LABELS,
  MEMBERSHIP_MONTHLY_YUAN,
  PLAN_FEATURE_LINES,
  normalizePlan,
  buildEntitlements,
  computeMemberUsageRemaining,
}
