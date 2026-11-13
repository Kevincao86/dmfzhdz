const catalog = require('./mpMembershipCatalogMp.js')

function workRoleFromIdentity(identity) {
  const id = String(identity || '').trim()
  if (id === 'pr' || id === 'talent' || id === 'shoot' || id === 'edit') return id
  return 'talent'
}

function readMembershipPlanId(account, identity, member, prProfile) {
  if (identity === 'pr') {
    return String(
      (prProfile && prProfile.mpMembershipPlan) ||
        (account && account.mpMembershipPlan) ||
        'basic',
    ).trim() || 'basic'
  }
  return String(
    (member && member.mpMembershipPlan) ||
      (account && account.mpMembershipPlan) ||
      'basic',
  ).trim() || 'basic'
}

function readMembershipExpiresAt(account, identity, member, prProfile) {
  if (identity === 'pr') {
    return String(
      (prProfile && prProfile.mpMembershipExpiresAt) ||
        (account && account.mpMembershipExpiresAt) ||
        '',
    ).trim()
  }
  return String(
    (member && member.mpMembershipExpiresAt) ||
      (account && account.mpMembershipExpiresAt) ||
      '',
  ).trim()
}

function formatExpiryLabel(planId, expiresAt) {
  const plan = String(planId || 'basic').trim() || 'basic'
  if (plan === 'basic') return ''
  const raw = String(expiresAt || '').trim()
  if (!raw) return '到期：未记录'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const dateStr = d.toLocaleDateString('zh-CN')
  if (d.getTime() < now) return `已过期 ${dateStr}`
  return `到期 ${dateStr}`
}

function membershipCtaLabel(planId) {
  const plan = String(planId || 'basic').trim() || 'basic'
  if (plan === 'basic') return '升级会员'
  if (plan === 'enterprise') return '续费/管理'
  return '升级/续费'
}

function billingLabel(billing) {
  return billing === 'yearly' ? '年付' : '月付'
}

function orderStatusLabel(status) {
  if (status === 'confirmed') return '已完成'
  if (status === 'rejected') return '已关闭'
  return '待支付'
}

function payModeLabel(payMode) {
  if (payMode === 'wechat_jsapi') return '微信小程序'
  if (payMode === 'wechat_native') return '微信扫码'
  if (payMode === 'manual') return '手动申报'
  return '微信'
}

function yuanFromCents(cents) {
  const n = Number(cents)
  if (!Number.isFinite(n)) return '0.00'
  return (n / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtTime(iso) {
  const d = new Date(String(iso || ''))
  if (Number.isNaN(d.getTime())) return String(iso || '—')
  return d.toLocaleString('zh-CN', { hour12: false })
}

module.exports = {
  workRoleFromIdentity,
  readMembershipPlanId,
  readMembershipExpiresAt,
  formatExpiryLabel,
  membershipCtaLabel,
  billingLabel,
  orderStatusLabel,
  payModeLabel,
  yuanFromCents,
  fmtTime,
  planLabel: catalog.planLabel,
}
