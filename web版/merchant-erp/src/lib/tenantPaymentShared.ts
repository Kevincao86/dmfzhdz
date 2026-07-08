/**
 * 商家 ERP 租户在线支付：订单创建、确认（订阅 / 钱包充值 / 积分充值）
 */
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildSubscriptionPurchasePatch,
  readEntitlementDays,
} from '../../../商家管理后台/api/_lib/tenantEntitlementCore.js'
import {
  membershipPlanFromVerifiedCents,
  rechargeCreditFromVerifiedCents,
  subscriptionDaysFromVerifiedCents,
} from '../../../商家管理后台/src/ops/paymentTierLogic.js'
import { creditErpRechargePoints, ensureErpMonthlyGiftPointsGranted } from './erpPointsCore.js'
import {
  computeErpRechargePointsFromCents,
  ERP_POINTS_RECHARGE_TIERS,
} from './erpPointsEconomics.js'
import type { MembershipPlan } from './membershipPlan.js'

export type TenantPayChannel = 'wechat' | 'alipay' | 'douyin'
export type TenantOrderKind = 'subscription' | 'recharge' | 'points_recharge'

export type TenantPaymentOrderRow = {
  id: string
  tenant_id: string
  order_kind: string
  amount_cents: number
  status: string
  pay_channel?: string | null
  out_trade_no?: string | null
  pay_mode?: string | null
  pay_source?: string | null
  verified_amount_cents?: number | null
  transaction_id?: string | null
  created_at?: string
  confirmed_at?: string | null
  extend_days_applied?: number | null
  wallet_credit_cents_applied?: number | null
  points_credit_applied?: number | null
  client_note?: string | null
}

const PAY_TTL_MS = 15 * 60 * 1000

export function makeTenantOutTradeNo(): string {
  const ts = Date.now().toString(36)
  const rnd = randomBytes(4).toString('hex')
  return `TERP${ts}${rnd}`.slice(0, 32)
}

export function tenantOrderDescription(kind: TenantOrderKind, amountCents: number): string {
  const yuan = (amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2)
  if (kind === 'subscription') return `灵祺ERP会员订阅 ¥${yuan}`
  if (kind === 'points_recharge') return `灵祺ERP积分充值 ¥${yuan}`
  return `灵祺ERP账户充值 ¥${yuan}`
}

export function resolvePointsRechargeFromCents(cents: number): number {
  const c = Math.floor(Number(cents) || 0)
  const preset = ERP_POINTS_RECHARGE_TIERS.find((t) => Math.round(t.yuan * 100) === c)
  if (preset) return preset.points
  return computeErpRechargePointsFromCents(c)
}

export async function createTenantOnlinePaymentOrder(
  admin: SupabaseClient,
  input: {
    tenantId: string
    userId: string | null
    orderKind: TenantOrderKind
    amountCents: number
    channel: TenantPayChannel
    payMode: string
    clientNote?: string | null
  },
): Promise<TenantPaymentOrderRow> {
  const cents = Math.floor(Number(input.amountCents) || 0)
  if (cents <= 0) throw new Error('invalid_amount')

  const outTradeNo = makeTenantOutTradeNo()
  const nowIso = new Date().toISOString()
  const row: Record<string, unknown> = {
    tenant_id: input.tenantId,
    created_by_user_id: input.userId,
    order_kind: input.orderKind,
    amount_cents: cents,
    pay_channel: input.channel,
    pay_mode: input.payMode,
    pay_source: 'online',
    out_trade_no: outTradeNo,
    client_note: input.clientNote ?? null,
    status: 'pending',
    created_at: nowIso,
    updated_at: nowIso,
  }

  const { data, error } = await admin.from('merchant_payment_orders').insert(row).select('*').single()
  if (error) throw error
  return data as TenantPaymentOrderRow
}

export async function findTenantOrderByOutTradeNo(
  admin: SupabaseClient,
  outTradeNo: string,
): Promise<TenantPaymentOrderRow | null> {
  const key = String(outTradeNo || '').trim()
  if (!key) return null
  const { data, error } = await admin
    .from('merchant_payment_orders')
    .select('*')
    .eq('out_trade_no', key)
    .maybeSingle()
  if (error) throw error
  return (data as TenantPaymentOrderRow) || null
}

export function isTenantOrderPayExpired(order: TenantPaymentOrderRow, nowMs = Date.now()): boolean {
  if (order.status !== 'pending') return false
  const created = new Date(String(order.created_at || '')).getTime()
  if (!Number.isFinite(created)) return false
  return nowMs - created >= PAY_TTL_MS
}

export async function confirmTenantOnlinePaymentOrder(
  admin: SupabaseClient,
  order: TenantPaymentOrderRow,
  opts?: { transactionId?: string | null; verifiedCents?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (order.status === 'confirmed') return { ok: true }
  if (order.status !== 'pending' && order.status !== 'amount_verified') {
    return { ok: false, error: 'order_not_pending' }
  }

  const vc = Math.floor(
    Number(opts?.verifiedCents ?? order.verified_amount_cents ?? order.amount_cents) || 0,
  )
  if (vc <= 0) return { ok: false, error: 'invalid_amount' }

  const tenantId = String(order.tenant_id)
  const nowIso = new Date().toISOString()
  const tx = opts?.transactionId ? String(opts.transactionId).trim() : null

  if (order.order_kind === 'subscription') {
    const days = subscriptionDaysFromVerifiedCents(vc)
    if (days <= 0) return { ok: false, error: 'cannot_derive_days' }

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .select('service_expire_at, official_days, subscription_days, ops_gift_days, membership_plan')
      .eq('id', tenantId)
      .maybeSingle()
    if (te || !tenant) return { ok: false, error: 'tenant_load_failed' }

    const sub = readEntitlementDays(
      tenant.subscription_days != null ? tenant.subscription_days : tenant.official_days,
    )
    const gift = readEntitlementDays(tenant.ops_gift_days)
    const ent = buildSubscriptionPurchasePatch({
      subscriptionDays: sub,
      opsGiftDays: gift,
      serviceExpireAt: typeof tenant.service_expire_at === 'string' ? tenant.service_expire_at : null,
      purchasedDays: days,
    })
    const nextPlan = membershipPlanFromVerifiedCents(vc) as MembershipPlan | null
    const tenantPatch: Record<string, unknown> = { ...ent, updated_at: nowIso }
    if (nextPlan) tenantPatch.membership_plan = nextPlan

    const { error: upTe } = await admin.from('tenants').update(tenantPatch).eq('id', tenantId)
    if (upTe) return { ok: false, error: 'tenant_update_failed' }

    if (nextPlan) {
      await ensureErpMonthlyGiftPointsGranted(admin, tenantId, { plan: nextPlan })
    }

    const { error: upOr } = await admin
      .from('merchant_payment_orders')
      .update({
        status: 'confirmed',
        verified_amount_cents: vc,
        verified_at: nowIso,
        confirmed_at: nowIso,
        extend_days_applied: days,
        transaction_id: tx,
        updated_at: nowIso,
      })
      .eq('id', order.id)
      .in('status', ['pending', 'amount_verified'])
    if (upOr) return { ok: false, error: 'order_finalize_failed' }
    return { ok: true }
  }

  if (order.order_kind === 'recharge') {
    const credit = rechargeCreditFromVerifiedCents(vc)
    if (credit <= 0) return { ok: false, error: 'invalid_credit' }

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .select('wallet_balance_cents')
      .eq('id', tenantId)
      .maybeSingle()
    if (te || !tenant) return { ok: false, error: 'tenant_load_failed' }

    const prevBal = Math.max(0, Math.floor(Number(tenant.wallet_balance_cents) || 0))
    const newBal = prevBal + credit
    const { error: upTe } = await admin
      .from('tenants')
      .update({ wallet_balance_cents: newBal, updated_at: nowIso })
      .eq('id', tenantId)
    if (upTe) return { ok: false, error: 'tenant_wallet_update_failed' }

    const { error: le } = await admin.from('tenant_wallet_ledger').insert({
      tenant_id: tenantId,
      delta_cents: credit,
      balance_after_cents: newBal,
      reason: '在线充值到账',
      ref_order_id: order.id,
    })
    if (le && !/does not exist/i.test(le.message)) return { ok: false, error: 'ledger_insert_failed' }

    const { error: upOr } = await admin
      .from('merchant_payment_orders')
      .update({
        status: 'confirmed',
        verified_amount_cents: vc,
        verified_at: nowIso,
        confirmed_at: nowIso,
        wallet_credit_cents_applied: credit,
        transaction_id: tx,
        updated_at: nowIso,
      })
      .eq('id', order.id)
      .in('status', ['pending', 'amount_verified'])
    if (upOr) return { ok: false, error: 'order_finalize_failed' }
    return { ok: true }
  }

  if (order.order_kind === 'points_recharge') {
    const pts = resolvePointsRechargeFromCents(vc)
    if (pts <= 0) return { ok: false, error: 'invalid_points' }

    await creditErpRechargePoints(admin, tenantId, pts, '积分在线充值到账', order.id)

    const { error: upOr } = await admin
      .from('merchant_payment_orders')
      .update({
        status: 'confirmed',
        verified_amount_cents: vc,
        verified_at: nowIso,
        confirmed_at: nowIso,
        points_credit_applied: pts,
        transaction_id: tx,
        updated_at: nowIso,
      })
      .eq('id', order.id)
      .in('status', ['pending', 'amount_verified'])
    if (upOr) return { ok: false, error: 'order_finalize_failed' }
    return { ok: true }
  }

  return { ok: false, error: 'unsupported_order_kind' }
}
