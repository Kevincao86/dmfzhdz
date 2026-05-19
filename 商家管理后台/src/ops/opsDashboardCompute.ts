import type { RegistryMpRecruitmentOrder, RegistryRecruitmentOrder } from './opsRegistryApi'
import type { SupabaseTenantRow } from './supabaseTenantsApi'
import { timestampInRange, type DashboardRange } from './opsDashboardRange'

export type DashboardStats = {
  registeredUsers: number
  activeUsers: number
  recruitmentMerchants: number
}

export type DashboardDailyPoint = {
  date: string
  registered: number
  active: number
  recruitmentMerchants: number
}

function normMerchantName(name: string): string {
  return name.trim().toLowerCase()
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

export function computeDashboardStats(
  tenants: SupabaseTenantRow[],
  recruitmentOrders: RegistryRecruitmentOrder[],
  mpOrders: RegistryMpRecruitmentOrder[],
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
    if (!timestampInRange(o.createdAt, range)) continue
    const n = normMerchantName(o.customerName)
    if (n) merchantNames.add(n)
  }
  for (const o of mpOrders) {
    if (!timestampInRange(o.createdAt, range)) continue
    const n = normMerchantName(o.customerName)
    if (n) merchantNames.add(n)
  }

  return {
    registeredUsers,
    activeUsers,
    recruitmentMerchants: merchantNames.size,
  }
}

export function computeDashboardDailySeries(
  tenants: SupabaseTenantRow[],
  recruitmentOrders: RegistryRecruitmentOrder[],
  mpOrders: RegistryMpRecruitmentOrder[],
  range: DashboardRange,
): DashboardDailyPoint[] {
  const days = eachDayKeys(range)
  const registeredByDay = new Map<string, number>()
  const activeByDay = new Map<string, number>()
  const recruitByDay = new Map<string, Set<string>>()

  for (const d of days) {
    registeredByDay.set(d, 0)
    activeByDay.set(d, 0)
    recruitByDay.set(d, new Set())
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
    const dk = dayKey(o.createdAt)
    if (!dk || !recruitByDay.has(dk)) continue
    if (!timestampInRange(o.createdAt, range)) continue
    const n = normMerchantName(o.customerName)
    if (n) recruitByDay.get(dk)!.add(n)
  }
  for (const o of mpOrders) {
    const dk = dayKey(o.createdAt)
    if (!dk || !recruitByDay.has(dk)) continue
    if (!timestampInRange(o.createdAt, range)) continue
    const n = normMerchantName(o.customerName)
    if (n) recruitByDay.get(dk)!.add(n)
  }

  return days.map((date) => ({
    date,
    registered: registeredByDay.get(date) ?? 0,
    active: activeByDay.get(date) ?? 0,
    recruitmentMerchants: recruitByDay.get(date)?.size ?? 0,
  }))
}
