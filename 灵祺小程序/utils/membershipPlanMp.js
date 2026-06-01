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
  free: ['直连 AI 每月 50 次（豆包/千问/MiniMax/DeepSeek）', '不含 GEO、竞对分析、报税管理'],
  member: ['全功能开放', 'AI：豆包 / 千问 / MiniMax / DeepSeek'],
  member_plus: ['全功能开放', '全部 AI 模型（含 OpenAI / Claude / Gemini / Grok）'],
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
