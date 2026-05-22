const rest = require('./supabaseRest.js')
const planUtil = require('./membershipPlanMp.js')

async function loadMembershipSnapshot() {
  const tenantId = await rest.fetchPrimaryTenantId()
  const row = await rest.fetchTenantMembershipRow(tenantId)
  const plan = planUtil.normalizePlan(row && row.membership_plan)
  const ent = planUtil.buildEntitlements(plan, row && row.direct_ai_calls_used)
  const subDays = Math.max(0, Math.floor(Number(row && row.subscription_days) || 0))
  const giftDays = Math.max(0, Math.floor(Number(row && row.ops_gift_days) || 0))
  const officialDays = Math.max(0, Math.floor(Number(row && row.official_days) || 0))
  const totalEntitlementDays = subDays + giftDays || officialDays
  const usage = planUtil.computeMemberUsageRemaining(row && row.service_expire_at)
  return {
    tenantId,
    ent,
    subscriptionDays: subDays,
    opsGiftDays: giftDays,
    totalEntitlementDays,
    memberUsage: usage,
  }
}

module.exports = { loadMembershipSnapshot }
