/**
 * ERP 租户 AI 积分扣减：月赠发放、余额校验、套餐桶优先扣费与幂等。
 * 消耗单价与星选 mp 共用 mpPointsEconomics（视频/文稿/Brief/云剪等）。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ensureErpMonthlyGiftPointsGranted,
  readTenantPointsBalances,
  spendErpPoints,
} from './erpPointsCore.js'
import { normalizeMembershipPlan } from './membershipPlan.js'
import {
  ERP_AGENT_POINTS_PER_TURN,
  ERP_AGENT_USAGE_KIND,
  type ErpAgentUsageKind,
} from './erpPointsEconomics.js'
import {
  MP_POINTS_REVIEW_AI_REPLIES_PER_CHARGE,
  MP_POINTS_USAGE_KIND_LABELS,
  mpPointsCostForUsage,
  mpPointsReviewAiBatchSlot,
  mpPointsReviewAiChargeForNext,
  parseMpPointsUsageKind,
  type MpPointsUsageKind,
} from './mpPointsEconomics.js'

export type ErpAiUsageKind = MpPointsUsageKind | ErpAgentUsageKind

const ERP_USAGE_KIND_LABELS: Record<ErpAiUsageKind, string> = {
  ...MP_POINTS_USAGE_KIND_LABELS,
  agent: 'AI 智能体对话',
}

export type ErpAiPointsSpendResult =
  | {
      ok: true
      pointsCharged: number
      fromPackage: number
      fromRecharge: number
      packageBalance: number
      rechargeBalance: number
      balance: number
      already?: boolean
    }
  | {
      ok: false
      error: 'insufficient_points' | 'invalid_amount' | 'invalid_kind' | 'tenant_not_found'
      message: string
      required?: number
      balance?: number
    }

const IDEMP_PREFIX = '[idemp:'

export function computeErpAiPointsCharge(
  kind: ErpAiUsageKind,
  opts?: { durationSec?: number; pointsOverride?: number; motionImitate?: boolean },
): number {
  const override = Math.floor(Number(opts?.pointsOverride) || 0)
  if (override > 0) return override
  if (kind === ERP_AGENT_USAGE_KIND) return ERP_AGENT_POINTS_PER_TURN
  return mpPointsCostForUsage(kind, opts)
}

export function formatErpAiPointsInsufficient(balance: number, required: number): string {
  return `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${required.toLocaleString('zh-CN')}），请先充值或等待会员月赠积分到账`
}

function buildSpendReason(kind: ErpAiUsageKind, note?: string, idempotencyKey?: string): string {
  const label = ERP_USAGE_KIND_LABELS[kind] || kind
  const base = (note || '').trim() || `${label} 扣费`
  const key = String(idempotencyKey || '').trim()
  return key ? `${base} ${IDEMP_PREFIX}${key}]` : base
}

export async function findErpIdempotentSpend(
  admin: SupabaseClient,
  tenantId: string,
  idempotencyKey: string,
): Promise<{
  pointsCharged: number
  fromPackage: number
  fromRecharge: number
  packageBalance: number
  rechargeBalance: number
} | null> {
  const key = String(idempotencyKey || '').trim()
  if (!key) return null
  const marker = `${IDEMP_PREFIX}${key}]`
  const { data, error } = await admin
    .from('tenant_points_ledger')
    .select(
      'delta_package_points, delta_recharge_points, balance_package_after, balance_recharge_after',
    )
    .eq('tenant_id', tenantId)
    .ilike('reason', `%${marker}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (/does not exist|Could not find/i.test(error.message)) return null
    throw error
  }
  if (!data) return null
  const fromPackage = Math.max(0, -Math.floor(Number(data.delta_package_points) || 0))
  const fromRecharge = Math.max(0, -Math.floor(Number(data.delta_recharge_points) || 0))
  const charged = fromPackage + fromRecharge
  if (charged <= 0) return null
  return {
    pointsCharged: charged,
    fromPackage,
    fromRecharge,
    packageBalance: Math.max(0, Math.floor(Number(data.balance_package_after) || 0)),
    rechargeBalance: Math.max(0, Math.floor(Number(data.balance_recharge_after) || 0)),
  }
}

/** 查询余额（顺带触发当月套餐桶月赠发放） */
export async function readErpTenantPointsBalances(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ packagePoints: number; rechargePoints: number; totalPoints: number }> {
  const { data: tenant, error } = await admin
    .from('tenants')
    .select('membership_plan, erp_package_points_balance, erp_recharge_points_balance')
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

/** 仅校验是否够扣，不写入 */
export async function assertErpAiPointsAffordable(
  admin: SupabaseClient,
  tenantId: string,
  kind: ErpAiUsageKind,
  opts?: { durationSec?: number; pointsOverride?: number; motionImitate?: boolean },
): Promise<ErpAiPointsSpendResult> {
  const points = computeErpAiPointsCharge(kind, opts)
  if (points <= 0) {
    return { ok: false, error: 'invalid_amount', message: '无效扣费金额' }
  }
  const balances = await readErpTenantPointsBalances(admin, tenantId)
  if (balances.totalPoints < points) {
    return {
      ok: false,
      error: 'insufficient_points',
      message: formatErpAiPointsInsufficient(balances.totalPoints, points),
      required: points,
      balance: balances.totalPoints,
    }
  }
  return {
    ok: true,
    pointsCharged: 0,
    fromPackage: 0,
    fromRecharge: 0,
    packageBalance: balances.packagePoints,
    rechargeBalance: balances.rechargePoints,
    balance: balances.totalPoints,
  }
}

/**
 * 扣减 ERP 积分：先确保月赠到账 → 优先扣套餐桶 → 不足再扣充值桶 → 写 tenant_points_ledger。
 */
export async function spendErpAiPoints(
  admin: SupabaseClient,
  tenantId: string,
  opts: {
    kind: ErpAiUsageKind
    durationSec?: number
    pointsOverride?: number
    motionImitate?: boolean
    idempotencyKey?: string
    note?: string
  },
): Promise<ErpAiPointsSpendResult> {
  const kind = opts.kind
  const idempotencyKey = String(opts.idempotencyKey || '').trim()
  if (idempotencyKey) {
    const hit = await findErpIdempotentSpend(admin, tenantId, idempotencyKey)
    if (hit) {
      return {
        ok: true,
        pointsCharged: hit.pointsCharged,
        fromPackage: hit.fromPackage,
        fromRecharge: hit.fromRecharge,
        packageBalance: hit.packageBalance,
        rechargeBalance: hit.rechargeBalance,
        balance: hit.packageBalance + hit.rechargeBalance,
        already: true,
      }
    }
  }

  const points = computeErpAiPointsCharge(kind, {
    durationSec: opts.durationSec,
    pointsOverride: opts.pointsOverride,
    motionImitate: opts.motionImitate,
  })
  if (points <= 0) {
    return { ok: false, error: 'invalid_amount', message: '无效扣费金额' }
  }

  const balances = await readErpTenantPointsBalances(admin, tenantId)
  if (balances.totalPoints < points) {
    return {
      ok: false,
      error: 'insufficient_points',
      message: formatErpAiPointsInsufficient(balances.totalPoints, points),
      required: points,
      balance: balances.totalPoints,
    }
  }

  const reason = buildSpendReason(kind, opts.note, idempotencyKey)
  const spent = await spendErpPoints(admin, tenantId, points, reason, kind)
  if (!spent.ok) {
    return {
      ok: false,
      error: 'insufficient_points',
      message: formatErpAiPointsInsufficient(spent.balance, points),
      required: points,
      balance: spent.balance,
    }
  }

  return {
    ok: true,
    pointsCharged: spent.charged,
    fromPackage: spent.fromPackage,
    fromRecharge: spent.fromRecharge,
    packageBalance: spent.packageBalance,
    rechargeBalance: spent.rechargeBalance,
    balance: spent.totalBalance,
  }
}

export function parseErpAiPointsUsageKind(raw: unknown): ErpAiUsageKind | null {
  const k = String(raw || '').trim()
  if (k === ERP_AGENT_USAGE_KIND) return ERP_AGENT_USAGE_KIND
  return parseMpPointsUsageKind(raw)
}

/** 生成前：本组第 1 条需要余额 ≥ 1；组内其余条已含在本批积分内。 */
export async function assertReviewAiBatchAffordable(
  admin: SupabaseClient,
  tenantId: string,
): Promise<ErpAiPointsSpendResult> {
  const prior = await countReviewAiLedgerSuccesses(admin, tenantId)
  const charge = mpPointsReviewAiChargeForNext(prior)
  const balances = await readErpTenantPointsBalances(admin, tenantId)
  if (charge > 0 && balances.totalPoints < charge) {
    return {
      ok: false,
      error: 'insufficient_points',
      message: formatErpAiPointsInsufficient(balances.totalPoints, charge),
      required: charge,
      balance: balances.totalPoints,
    }
  }
  return {
    ok: true,
    pointsCharged: 0,
    fromPackage: 0,
    fromRecharge: 0,
    packageBalance: balances.packagePoints,
    rechargeBalance: balances.rechargePoints,
    balance: balances.totalPoints,
  }
}

/** 已入账的评价回复 AI 条数（含扣分与组内 0 积分流水）。 */
export async function countReviewAiLedgerSuccesses(
  admin: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('tenant_points_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('usage_kind', 'review_ai')
  if (error) {
    if (/does not exist|Could not find/i.test(error.message)) return 0
    throw error
  }
  return Math.max(0, Math.floor(Number(count) || 0))
}

/**
 * 评价回复成功后入账：每 25 条的第 1 条扣 1 积分，其余写 0 积分流水，usage_kind 均为 review_ai。
 */
export async function recordReviewAiSuccess(
  admin: SupabaseClient,
  tenantId: string,
  opts?: { idempotencyKey?: string },
): Promise<ErpAiPointsSpendResult> {
  const prior = await countReviewAiLedgerSuccesses(admin, tenantId)
  const charge = mpPointsReviewAiChargeForNext(prior)
  const slot = mpPointsReviewAiBatchSlot(prior)
  const idempotencyKey = String(opts?.idempotencyKey || '').trim()
  if (charge > 0) {
    return spendErpAiPoints(admin, tenantId, {
      kind: 'review_ai',
      pointsOverride: charge,
      idempotencyKey,
      note: `每 ${MP_POINTS_REVIEW_AI_REPLIES_PER_CHARGE} 条扣 1 积分`,
    })
  }

  const balances = await readErpTenantPointsBalances(admin, tenantId)
  const reason = buildSpendReason(
    'review_ai',
    `本批 ${slot}/${MP_POINTS_REVIEW_AI_REPLIES_PER_CHARGE}，已含在本批 1 积分内`,
    idempotencyKey,
  )
  const { error } = await admin.from('tenant_points_ledger').insert({
    tenant_id: tenantId,
    delta_package_points: 0,
    delta_recharge_points: 0,
    balance_package_after: balances.packagePoints,
    balance_recharge_after: balances.rechargePoints,
    reason,
    usage_kind: 'review_ai',
  })
  if (error && !/does not exist|Could not find/i.test(error.message)) throw error
  return {
    ok: true,
    pointsCharged: 0,
    fromPackage: 0,
    fromRecharge: 0,
    packageBalance: balances.packagePoints,
    rechargeBalance: balances.rechargePoints,
    balance: balances.totalPoints,
  }
}
