import type { RegistryMpRecruitmentOrder, RegistryRecruitmentOrder } from './opsRegistryApi'
import type { OpsPaymentOrderRow } from './opsPaymentOrdersApi'
import { membershipPlanFromVerifiedCents } from './paymentTierLogic'
import type { SupabaseTenantRow } from './supabaseTenantsApi'
import { timestampInRange, type DashboardRange } from './opsDashboardRange'

export type DashboardStats = {
  registeredUsers: number
  activeUsers: number
  recruitmentMerchants: number
  memberSubscribeUsers: number
  memberPlusSubscribeUsers: number
}

export type DashboardDailyPoint = {
  date: string
  registered: number
  active: number
  recruitmentMerchants: number
  memberSubscribe: number
  memberPlusSubscribe: number
}

function normMerchantName(name: string | undefined | null): string {
  return String(name ?? '').trim().toLowerCase()
}

function recruitmentMerchantKey(o: {
  customerName?: string | null
  storeName?: string | null
}): string {
  return normMerchantName(o.customerName || o.storeName)
}

function normalizeTenantPlan(raw?: string): 'free' | 'member' | 'member_plus' {
  if (raw === 'member' || raw === 'member_plus') return raw
  return 'free'
}

function eachDayKeys(range: DashboardRange): string[] {
  const keys: string[] = []
  const cur = new Date(range.start)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(range.end)
  end.setHours(0, 0, 0, 0)
  while (cur.getTime() <= end.getTime()) {
    keys.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return keys
}

function dayKey(iso: string): string | null {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  return t.toISOString().slice(0, 10)
}

function orderConfirmTime(o: OpsPaymentOrderRow): string {
  return o.confirmed_at || o.verified_at || o.updated_at || o.created_at || ''
}

function subscriptionPlanFromOrder(o: OpsPaymentOrderRow): 'member' | 'member_plus' | null {
  if (o.order_kind !== 'subscription') return null
  if (o.status !== 'confirmed') return null
  const cents = o.verified_amount_cents ?? o.amount_cents
  const plan = membershipPlanFromVerifiedCents(cents)
  if (plan === 'member' || plan === 'member_plus') return plan
  return null
}

/** 周期内开通订阅的商户（订单确认 + 运营手动改档，按 tenant 去重） */
function collectSubscriptionTenants(
  tenants: SupabaseTenantRow[],
  paymentOrders: OpsPaymentOrderRow[],
  range: DashboardRange,
): { member: Set<string>; memberPlus: Set<string> } {
  const member = new Set<string>()
  const memberPlus = new Set<string>()

  for (const o of paymentOrders) {
    const at = orderConfirmTime(o)
    if (!timestampInRange(at, range)) continue
    const plan = subscriptionPlanFromOrder(o)
    if (!plan || !o.tenant_id) continue
    if (plan === 'member') member.add(o.tenant_id)
    else memberPlus.add(o.tenant_id)
  }

  for (const t of tenants) {
    if (!timestampInRange(t.updated_at, range)) continue
    const plan = normalizeTenantPlan(t.membership_plan)
    if (plan === 'free') continue
    const subDays = (t.subscription_days ?? 0) + (t.ops_gift_days ?? 0)
    const hasEntitlement = subDays > 0 || Boolean(t.service_expire_at)
    if (!hasEntitlement) continue
    if (plan === 'member' && !memberPlus.has(t.tenant_id)) member.add(t.tenant_id)
    if (plan === 'member_plus') memberPlus.add(t.tenant_id)
  }

  return { member, memberPlus }
}

export function computeDashboardStats(
  tenants: SupabaseTenantRow[],
  recruitmentOrders: RegistryRecruitmentOrder[],
  mpOrders: RegistryMpRecruitmentOrder[],
  paymentOrders: OpsPaymentOrderRow[],
  range: DashboardRange,
): DashboardStats {
  let registeredUsers = 0
  let activeUsers = 0

  for (const t of tenants) {
    if (timestampInRange(t.created_at, range)) registeredUsers += 1

    if (timestampInRange(t.updated_at, range)) {
      const created = new Date(t.created_at).getTime()
      const updated = new Date(t.updated_at).getTime()
      const onlyRegisterBump =
        timestampInRange(t.created_at, range) &&
        !Number.isNaN(created) &&
        !Number.isNaN(updated) &&
        updated - created < 120_000
      if (!onlyRegisterBump) activeUsers += 1
    }
  }

  const merchantNames = new Set<string>()
  for (const o of recruitmentOrders) {
    if (!o?.createdAt || !timestampInRange(o.createdAt, range)) continue
    const n = recruitmentMerchantKey(o)
    if (n) merchantNames.add(n)
  }
  for (const o of mpOrders) {
    if (!o?.createdAt || !timestampInRange(o.createdAt, range)) continue
    const n = recruitmentMerchantKey(o)
    if (n) merchantNames.add(n)
  }

  const subs = collectSubscriptionTenants(tenants, paymentOrders, range)

  return {
    registeredUsers,
    activeUsers,
    recruitmentMerchants: merchantNames.size,
    memberSubscribeUsers: subs.member.size,
    memberPlusSubscribeUsers: subs.memberPlus.size,
  }
}

export function computeDashboardDailySeries(
  tenants: SupabaseTenantRow[],
  recruitmentOrders: RegistryRecruitmentOrder[],
  mpOrders: RegistryMpRecruitmentOrder[],
  paymentOrders: OpsPaymentOrderRow[],
  range: DashboardRange,
): DashboardDailyPoint[] {
  const days = eachDayKeys(range)
  const registeredByDay = new Map<string, number>()
  const activeByDay = new Map<string, number>()
  const recruitByDay = new Map<string, Set<string>>()
  const memberByDay = new Map<string, Set<string>>()
  const memberPlusByDay = new Map<string, Set<string>>()

  for (const d of days) {
    registeredByDay.set(d, 0)
    activeByDay.set(d, 0)
    recruitByDay.set(d, new Set())
    memberByDay.set(d, new Set())
    memberPlusByDay.set(d, new Set())
  }

  for (const t of tenants) {
    const ck = dayKey(t.created_at)
    if (ck && registeredByDay.has(ck) && timestampInRange(t.created_at, range)) {
      registeredByDay.set(ck, (registeredByDay.get(ck) ?? 0) + 1)
    }
    const uk = dayKey(t.updated_at)
    if (uk && activeByDay.has(uk) && timestampInRange(t.updated_at, range)) {
      const created = new Date(t.created_at).getTime()
      const updated = new Date(t.updated_at).getTime()
      const onlyRegisterBump =
        timestampInRange(t.created_at, range) &&
        !Number.isNaN(created) &&
        !Number.isNaN(updated) &&
        updated - created < 120_000
      if (!onlyRegisterBump) activeByDay.set(uk, (activeByDay.get(uk) ?? 0) + 1)
    }
  }

  for (const o of recruitmentOrders) {
    if (!o?.createdAt) continue
    const dk = dayKey(o.createdAt)
    if (!dk || !recruitByDay.has(dk)) continue
    if (!timestampInRange(o.createdAt, range)) continue
    const n = recruitmentMerchantKey(o)
    if (n) recruitByDay.get(dk)!.add(n)
  }
  for (const o of mpOrders) {
    if (!o?.createdAt) continue
    const dk = dayKey(o.createdAt)
    if (!dk || !recruitByDay.has(dk)) continue
    if (!timestampInRange(o.createdAt, range)) continue
    const n = recruitmentMerchantKey(o)
    if (n) recruitByDay.get(dk)!.add(n)
  }

  for (const o of paymentOrders) {
    const at = orderConfirmTime(o)
    const dk = dayKey(at)
    if (!dk || !timestampInRange(at, range)) continue
    const plan = subscriptionPlanFromOrder(o)
    if (!plan || !o.tenant_id) continue
    if (plan === 'member' && memberByDay.has(dk)) memberByDay.get(dk)!.add(o.tenant_id)
    if (plan === 'member_plus' && memberPlusByDay.has(dk)) memberPlusByDay.get(dk)!.add(o.tenant_id)
  }

  return days.map((date) => ({
    date,
    registered: registeredByDay.get(date) ?? 0,
    active: activeByDay.get(date) ?? 0,
    recruitmentMerchants: recruitByDay.get(date)?.size ?? 0,
    memberSubscribe: memberByDay.get(date)?.size ?? 0,
    memberPlusSubscribe: memberPlusByDay.get(date)?.size ?? 0,
  }))
}
