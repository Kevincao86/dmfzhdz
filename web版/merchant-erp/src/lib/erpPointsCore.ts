import type { SupabaseClient } from '@supabase/supabase-js'
import type { MembershipPlan } from './membershipPlan.js'
import { normalizeMembershipPlan } from './membershipPlan.js'
import {
  erpMonthlyGiftPointsForPlan,
  shanghaiYearMonth,
} from './erpPointsEconomics.js'

export type TenantPointsRow = {
  membership_plan?: string | null
  erp_package_points_balance?: number | null
  erp_recharge_points_balance?: number | null
  erp_points_gift_month?: string | null
  erp_points_gift_granted_month?: number | null
}

export type TenantPointsBalances = {
  packagePoints: number
  rechargePoints: number
  totalPoints: number
}

export function readTenantPointsBalances(row: TenantPointsRow | null | undefined): TenantPointsBalances {
  const pkg = Math.max(0, Math.floor(Number(row?.erp_package_points_balance) || 0))
  const rch = Math.max(0, Math.floor(Number(row?.erp_recharge_points_balance) || 0))
  return { packagePoints: pkg, rechargePoints: rch, totalPoints: pkg + rch }
}

async function insertPointsLedger(
  admin: SupabaseClient,
  input: {
    tenantId: string
    deltaPackage: number
    deltaRecharge: number
    balancePackageAfter: number
    balanceRechargeAfter: number
    reason: string
    usageKind?: string | null
    refOrderId?: string | null
  },
): Promise<void> {
  const { error } = await admin.from('tenant_points_ledger').insert({
    tenant_id: input.tenantId,
    delta_package_points: input.deltaPackage,
    delta_recharge_points: input.deltaRecharge,
    balance_package_after: input.balancePackageAfter,
    balance_recharge_after: input.balanceRechargeAfter,
    reason: input.reason,
    usage_kind: input.usageKind ?? null,
    ref_order_id: input.refOrderId ?? null,
  })
  if (error && !/does not exist|Could not find/i.test(error.message)) throw error
}

/** 自然月首次访问时，按当前会员档位发放月赠积分至套餐桶；同月内升级档位则补差至新档额度 */
export async function ensureErpMonthlyGiftPointsGranted(
  admin: SupabaseClient,
  tenantId: string,
  opts?: { plan?: MembershipPlan; forceMonth?: string },
): Promise<{ granted: number; newPackageBalance: number }> {
  const { data: tenant, error } = await admin
    .from('tenants')
    .select(
      'membership_plan, erp_package_points_balance, erp_recharge_points_balance, erp_points_gift_month, erp_points_gift_granted_month',
    )
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw error
  if (!tenant) return { granted: 0, newPackageBalance: 0 }

  const plan = opts?.plan ?? normalizeMembershipPlan(tenant.membership_plan)
  const month = opts?.forceMonth ?? shanghaiYearMonth()
  const targetGift = erpMonthlyGiftPointsForPlan(plan)
  const prevMonth = String(tenant.erp_points_gift_month || '').trim()
  const pkgBal = Math.max(0, Math.floor(Number(tenant.erp_package_points_balance) || 0))
  const rchBal = Math.max(0, Math.floor(Number(tenant.erp_recharge_points_balance) || 0))
  const prevGranted = Math.max(0, Math.floor(Number(tenant.erp_points_gift_granted_month) || 0))
  const nowIso = new Date().toISOString()

  // 同月已发过：升级档位时补差（与星选 grantPackagePointsDelta 一致），不重置已消耗部分
  if (prevMonth === month) {
    const topUp = Math.max(0, targetGift - prevGranted)
    if (topUp <= 0) {
      return { granted: 0, newPackageBalance: pkgBal }
    }
    const newPkg = pkgBal + topUp
    const { error: upErr } = await admin
      .from('tenants')
      .update({
        erp_package_points_balance: newPkg,
        erp_points_gift_granted_month: targetGift,
        updated_at: nowIso,
      })
      .eq('id', tenantId)
    if (upErr) throw upErr
    await insertPointsLedger(admin, {
      tenantId,
      deltaPackage: topUp,
      deltaRecharge: 0,
      balancePackageAfter: newPkg,
      balanceRechargeAfter: rchBal,
      reason: `会员升级补差积分（${month}·${plan}）`,
    })
    return { granted: topUp, newPackageBalance: newPkg }
  }

  // 新自然月：套餐桶重置为当月赠送额度（未用完不结转）
  const delta = targetGift - pkgBal
  const newPkg = targetGift
  const { error: upErr } = await admin
    .from('tenants')
    .update({
      erp_package_points_balance: newPkg,
      erp_points_gift_month: month,
      erp_points_gift_granted_month: targetGift,
      updated_at: nowIso,
    })
    .eq('id', tenantId)
  if (upErr) throw upErr

  if (delta !== 0) {
    await insertPointsLedger(admin, {
      tenantId,
      deltaPackage: delta,
      deltaRecharge: 0,
      balancePackageAfter: newPkg,
      balanceRechargeAfter: rchBal,
      reason: `会员月赠积分（${month}）`,
    })
  }

  return { granted: Math.max(0, delta), newPackageBalance: newPkg }
}

export async function creditErpRechargePoints(
  admin: SupabaseClient,
  tenantId: string,
  points: number,
  reason: string,
  refOrderId?: string | null,
): Promise<{ newRechargeBalance: number; totalPoints: number }> {
  const pts = Math.max(0, Math.floor(Number(points) || 0))
  if (pts <= 0) return { newRechargeBalance: 0, totalPoints: 0 }

  const { data: tenant, error } = await admin
    .from('tenants')
    .select('erp_package_points_balance, erp_recharge_points_balance')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw error
  if (!tenant) throw new Error('tenant_not_found')

  const pkg = Math.max(0, Math.floor(Number(tenant.erp_package_points_balance) || 0))
  const prev = Math.max(0, Math.floor(Number(tenant.erp_recharge_points_balance) || 0))
  const next = prev + pts
  const nowIso = new Date().toISOString()

  const { error: upErr } = await admin
    .from('tenants')
    .update({ erp_recharge_points_balance: next, updated_at: nowIso })
    .eq('id', tenantId)
  if (upErr) throw upErr

  await insertPointsLedger(admin, {
    tenantId,
    deltaPackage: 0,
    deltaRecharge: pts,
    balancePackageAfter: pkg,
    balanceRechargeAfter: next,
    reason,
    refOrderId,
  })

  return { newRechargeBalance: next, totalPoints: pkg + next }
}

export type ErpPointsSpendResult =
  | {
      ok: true
      charged: number
      fromPackage: number
      fromRecharge: number
      packageBalance: number
      rechargeBalance: number
      totalBalance: number
    }
  | { ok: false; error: 'insufficient'; balance: number }

export async function spendErpPoints(
  admin: SupabaseClient,
  tenantId: string,
  points: number,
  reason: string,
  usageKind?: string | null,
): Promise<ErpPointsSpendResult> {
  const need = Math.max(0, Math.floor(Number(points) || 0))
  if (need <= 0) {
    const bal = await readTenantPointsBalancesAfterGift(admin, tenantId)
    return {
      ok: true,
      charged: 0,
      fromPackage: 0,
      fromRecharge: 0,
      packageBalance: bal.packagePoints,
      rechargeBalance: bal.rechargePoints,
      totalBalance: bal.totalPoints,
    }
  }

  const { data: tenant, error } = await admin
    .from('tenants')
    .select('erp_package_points_balance, erp_recharge_points_balance, membership_plan')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw error
  if (!tenant) return { ok: false, error: 'insufficient', balance: 0 }

  await ensureErpMonthlyGiftPointsGranted(admin, tenantId, {
    plan: normalizeMembershipPlan(tenant.membership_plan),
  })

  const refreshed = await admin
    .from('tenants')
    .select('erp_package_points_balance, erp_recharge_points_balance')
    .eq('id', tenantId)
    .maybeSingle()
  const row = refreshed.data
  let pkg = Math.max(0, Math.floor(Number(row?.erp_package_points_balance) || 0))
  let rch = Math.max(0, Math.floor(Number(row?.erp_recharge_points_balance) || 0))
  const total = pkg + rch
  if (need > total) return { ok: false, error: 'insufficient', balance: total }

  const fromPkg = Math.min(pkg, need)
  const fromRch = need - fromPkg
  pkg -= fromPkg
  rch -= fromRch

  const nowIso = new Date().toISOString()
  const { error: upErr } = await admin
    .from('tenants')
    .update({
      erp_package_points_balance: pkg,
      erp_recharge_points_balance: rch,
      updated_at: nowIso,
    })
    .eq('id', tenantId)
  if (upErr) throw upErr

  await insertPointsLedger(admin, {
    tenantId,
    deltaPackage: -fromPkg,
    deltaRecharge: -fromRch,
    balancePackageAfter: pkg,
    balanceRechargeAfter: rch,
    reason,
    usageKind,
  })

  return {
    ok: true,
    charged: need,
    fromPackage: fromPkg,
    fromRecharge: fromRch,
    packageBalance: pkg,
    rechargeBalance: rch,
    totalBalance: pkg + rch,
  }
}

async function readTenantPointsBalancesAfterGift(
  admin: SupabaseClient,
  tenantId: string,
): Promise<TenantPointsBalances> {
  const { data: tenant, error } = await admin
    .from('tenants')
    .select('erp_package_points_balance, erp_recharge_points_balance, membership_plan')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw error
  if (!tenant) return { packagePoints: 0, rechargePoints: 0, totalPoints: 0 }
  await ensureErpMonthlyGiftPointsGranted(admin, tenantId, {
    plan: normalizeMembershipPlan(tenant.membership_plan),
  })
  const refreshed = await admin
    .from('tenants')
    .select('erp_package_points_balance, erp_recharge_points_balance')
    .eq('id', tenantId)
    .maybeSingle()
  return readTenantPointsBalances(refreshed.data)
}
