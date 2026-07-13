/**
 * 运营台「订单管理」Supabase 读写逻辑：供本地 Vite 中间件与 Vercel Serverless 共用。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildSubscriptionPurchasePatch,
  readEntitlementDays,
} from '../../api/_lib/tenantEntitlementCore.js'
import {
  rechargeCreditFromVerifiedCents,
  membershipPlanFromVerifiedCents,
  subscriptionDaysFromVerifiedCents,
} from './paymentTierLogic'
import { ensureErpMonthlyGiftPointsGranted, creditErpRechargePoints } from '../../../web版/merchant-erp/src/lib/erpPointsCore.js'
import { resolvePointsRechargeFromCents } from '../../../web版/merchant-erp/src/lib/tenantPaymentShared.js'

function unreachableHint(...parts: (string | undefined)[]): string | undefined {
  const d = parts.filter(Boolean).join(' ')
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network error|Failed to fetch/i.test(d)) {
    return '无法连接 Supabase：请核对线上 SUPABASE_URL / 网络，或本地是否已执行 supabase start。'
  }
  return undefined
}

export type OpsPaymentAdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; body: Record<string, unknown> }

export async function listOpsPaymentOrders(
  admin: SupabaseClient,
): Promise<OpsPaymentAdminResult<{ rows: Record<string, unknown>[] }>> {
  const { data: orders, error: oe } = await admin
    .from('merchant_payment_orders')
    .select('*, tenants(name)')
    .order('created_at', { ascending: false })
    .limit(400)
  if (oe) {
    return {
      ok: false,
      status: 502,
      body: {
        ok: false,
        error: 'payment_orders_select_failed',
        detail: oe.message,
        hint: unreachableHint(oe.message),
      },
    }
  }
  const rows = (orders ?? []).map((raw: Record<string, unknown>) => {
    const tn = raw.tenants as { name?: string } | null | undefined
    const { tenants: _drop, ...rest } = raw
    return {
      ...rest,
      merchant_name: tn?.name ?? null,
    }
  })
  return { ok: true, data: { rows } }
}

export async function verifyOpsPaymentOrderAdmin(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<OpsPaymentAdminResult<{ done: true }>> {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const verified =
    typeof body.verified_amount_cents === 'number' && Number.isFinite(body.verified_amount_cents)
      ? Math.floor(body.verified_amount_cents)
      : NaN
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(verified) || verified <= 0) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_payload' } }
  }
  const { data: ord, error: ordErr } = await admin
    .from('merchant_payment_orders')
    .select('id, status, order_kind, amount_cents, tenant_id')
    .eq('id', id)
    .maybeSingle()
  if (ordErr) {
    return {
      ok: false,
      status: 502,
      body: { ok: false, error: 'order_load_failed', detail: ordErr.message },
    }
  }
  if (!ord || ord.status !== 'pending') {
    return { ok: false, status: 409, body: { ok: false, error: 'not_pending_or_missing' } }
  }
  if (ord.order_kind === 'refund') {
    const declared = Number(ord.amount_cents)
    if (!Number.isFinite(declared) || declared <= 0) {
      return { ok: false, status: 400, body: { ok: false, error: 'invalid_order_amount' } }
    }
    if (verified > declared) {
      return { ok: false, status: 400, body: { ok: false, error: 'refund_verify_exceeds_declared' } }
    }
    const { data: tenant, error: te } = await admin
      .from('tenants')
      .select('wallet_balance_cents')
      .eq('id', String(ord.tenant_id))
      .maybeSingle()
    if (te || !tenant) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'tenant_load_failed', detail: te?.message },
      }
    }
    const bal =
      typeof tenant.wallet_balance_cents === 'number' && Number.isFinite(tenant.wallet_balance_cents)
        ? tenant.wallet_balance_cents
        : 0
    if (verified > bal) {
      return { ok: false, status: 400, body: { ok: false, error: 'refund_verify_exceeds_wallet' } }
    }
  }
  const nowIso = new Date().toISOString()
  const { data: updated, error: ue } = await admin
    .from('merchant_payment_orders')
    .update({
      verified_amount_cents: verified,
      verified_at: nowIso,
      status: 'amount_verified',
      updated_at: nowIso,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (ue) {
    return { ok: false, status: 502, body: { ok: false, error: 'verify_failed', detail: ue.message } }
  }
  if (!updated?.id) {
    return { ok: false, status: 409, body: { ok: false, error: 'not_pending_or_missing' } }
  }
  return { ok: true, data: { done: true } }
}

export async function confirmOpsPaymentOrderAdmin(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<OpsPaymentAdminResult<{ done: true }>> {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_id' } }
  }
  const { data: order, error: oe } = await admin.from('merchant_payment_orders').select('*').eq('id', id).maybeSingle()
  if (oe) {
    return {
      ok: false,
      status: 502,
      body: { ok: false, error: 'order_load_failed', detail: oe.message },
    }
  }
  if (!order || order.status !== 'amount_verified') {
    return { ok: false, status: 409, body: { ok: false, error: 'order_not_ready' } }
  }
  const vc = Number(order.verified_amount_cents)
  if (!Number.isFinite(vc) || vc <= 0) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_verified_amount' } }
  }
  const tenantId = String(order.tenant_id)
  const nowIso = new Date().toISOString()

  if (order.order_kind === 'subscription') {
    const days = subscriptionDaysFromVerifiedCents(vc)
    if (days <= 0) {
      return { ok: false, status: 400, body: { ok: false, error: 'cannot_derive_days' } }
    }
    const { data: tenant, error: te } = await admin
      .from('tenants')
      .select('service_expire_at, official_days, subscription_days, ops_gift_days')
      .eq('id', tenantId)
      .maybeSingle()
    if (te || !tenant) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'tenant_load_failed', detail: te?.message },
      }
    }
    const sub = readEntitlementDays(
      tenant.subscription_days != null ? tenant.subscription_days : tenant.official_days,
    )
    const gift = readEntitlementDays(tenant.ops_gift_days)
    const ent = buildSubscriptionPurchasePatch({
      subscriptionDays: sub,
      opsGiftDays: gift,
      serviceExpireAt:
        typeof tenant.service_expire_at === 'string' ? tenant.service_expire_at : null,
      purchasedDays: days,
    })
    const nextPlan = membershipPlanFromVerifiedCents(vc)
    const tenantPatch: Record<string, unknown> = {
      ...ent,
      updated_at: nowIso,
    }
    if (nextPlan) tenantPatch.membership_plan = nextPlan
    const { error: upTe } = await admin.from('tenants').update(tenantPatch).eq('id', tenantId)
    if (upTe) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'tenant_update_failed', detail: upTe.message },
      }
    }
    if (nextPlan) {
      try {
        await ensureErpMonthlyGiftPointsGranted(admin as never, tenantId, { plan: nextPlan })
      } catch {
        /* 积分列未迁移时忽略，避免阻断订阅确认 */
      }
    }
    const { error: upOr } = await admin
      .from('merchant_payment_orders')
      .update({
        status: 'confirmed',
        confirmed_at: nowIso,
        extend_days_applied: days,
        wallet_credit_cents_applied: null,
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('status', 'amount_verified')
    if (upOr) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'order_finalize_failed', detail: upOr.message },
      }
    }
    return { ok: true, data: { done: true } }
  }

  if (order.order_kind === 'recharge') {
    const credit = rechargeCreditFromVerifiedCents(vc)
    if (credit <= 0) {
      return { ok: false, status: 400, body: { ok: false, error: 'invalid_credit' } }
    }
    const { data: tenant, error: te } = await admin
      .from('tenants')
      .select('wallet_balance_cents')
      .eq('id', tenantId)
      .maybeSingle()
    if (te || !tenant) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'tenant_load_failed', detail: te?.message },
      }
    }
    const prevBal =
      typeof tenant.wallet_balance_cents === 'number' && Number.isFinite(tenant.wallet_balance_cents)
        ? tenant.wallet_balance_cents
        : 0
    const newBal = prevBal + credit
    const { error: upTe } = await admin
      .from('tenants')
      .update({
        wallet_balance_cents: newBal,
        updated_at: nowIso,
      })
      .eq('id', tenantId)
    if (upTe) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'tenant_wallet_update_failed', detail: upTe.message },
      }
    }
    const { error: le } = await admin.from('tenant_wallet_ledger').insert({
      tenant_id: tenantId,
      delta_cents: credit,
      balance_after_cents: newBal,
      reason: '充值到账（运营确认）',
      ref_order_id: id,
    })
    if (le) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'ledger_insert_failed', detail: le.message },
      }
    }
    const { error: upOr } = await admin
      .from('merchant_payment_orders')
      .update({
        status: 'confirmed',
        confirmed_at: nowIso,
        extend_days_applied: null,
        wallet_credit_cents_applied: credit,
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('status', 'amount_verified')
    if (upOr) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'order_finalize_failed', detail: upOr.message },
      }
    }
    return { ok: true, data: { done: true } }
  }

  if (order.order_kind === 'points_recharge') {
    const pts = resolvePointsRechargeFromCents(vc)
    if (pts <= 0) {
      return { ok: false, status: 400, body: { ok: false, error: 'invalid_points' } }
    }
    try {
      await creditErpRechargePoints(admin as never, tenantId, pts, '积分充值到账（运营确认）', id)
    } catch (e) {
      return {
        ok: false,
        status: 502,
        body: {
          ok: false,
          error: 'points_credit_failed',
          detail: e instanceof Error ? e.message : String(e),
        },
      }
    }
    const { error: upOr } = await admin
      .from('merchant_payment_orders')
      .update({
        status: 'confirmed',
        confirmed_at: nowIso,
        points_credit_applied: pts,
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('status', 'amount_verified')
    if (upOr) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'order_finalize_failed', detail: upOr.message },
      }
    }
    return { ok: true, data: { done: true } }
  }

  if (order.order_kind === 'refund') {
    const debit = vc
    const { data: tenant, error: te } = await admin
      .from('tenants')
      .select('wallet_balance_cents')
      .eq('id', tenantId)
      .maybeSingle()
    if (te || !tenant) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'tenant_load_failed', detail: te?.message },
      }
    }
    const prevBal =
      typeof tenant.wallet_balance_cents === 'number' && Number.isFinite(tenant.wallet_balance_cents)
        ? tenant.wallet_balance_cents
        : 0
    if (debit > prevBal) {
      return {
        ok: false,
        status: 400,
        body: { ok: false, error: 'insufficient_wallet_for_refund' },
      }
    }
    const newBal = prevBal - debit
    const { error: upTe } = await admin
      .from('tenants')
      .update({
        wallet_balance_cents: newBal,
        updated_at: nowIso,
      })
      .eq('id', tenantId)
    if (upTe) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'tenant_wallet_update_failed', detail: upTe.message },
      }
    }
    const { error: le } = await admin.from('tenant_wallet_ledger').insert({
      tenant_id: tenantId,
      delta_cents: -debit,
      balance_after_cents: newBal,
      reason: '退款扣减（运营确认）',
      ref_order_id: id,
    })
    if (le) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'ledger_insert_failed', detail: le.message },
      }
    }
    const { error: upOr } = await admin
      .from('merchant_payment_orders')
      .update({
        status: 'confirmed',
        confirmed_at: nowIso,
        extend_days_applied: null,
        wallet_credit_cents_applied: null,
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('status', 'amount_verified')
    if (upOr) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'order_finalize_failed', detail: upOr.message },
      }
    }
    return { ok: true, data: { done: true } }
  }

  return { ok: false, status: 400, body: { ok: false, error: 'unknown_order_kind' } }
}

export async function deleteOpsPaymentOrderAdmin(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<OpsPaymentAdminResult<{ done: true }>> {
  const { requireOpsDeleteSmsGate } = await import('../../api/_lib/opsDeleteSmsGate.js')
  const smsGate = await requireOpsDeleteSmsGate(body)
  if (!smsGate.ok) {
    return {
      ok: false,
      status: smsGate.status,
      body: { ok: false, error: smsGate.error, message: smsGate.message },
    }
  }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_id' } }
  }
  const { data: order, error: oe } = await admin
    .from('merchant_payment_orders')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (oe) {
    return {
      ok: false,
      status: 502,
      body: { ok: false, error: 'order_load_failed', detail: oe.message },
    }
  }
  if (!order) {
    return { ok: false, status: 404, body: { ok: false, error: 'not_found' } }
  }
  const st = String(order.status)
  if (st === 'confirmed') {
    return {
      ok: false,
      status: 409,
      body: {
        ok: false,
        error: 'cannot_delete_confirmed',
        hint: '已确认入账的订单不可删除，如需冲正请另行处理。',
      },
    }
  }
  if (st !== 'pending' && st !== 'amount_verified' && st !== 'cancelled') {
    return { ok: false, status: 409, body: { ok: false, error: 'cannot_delete_status' } }
  }
  const { error: de } = await admin.from('merchant_payment_orders').delete().eq('id', id)
  if (de) {
    return { ok: false, status: 502, body: { ok: false, error: 'delete_failed', detail: de.message } }
  }
  return { ok: true, data: { done: true } }
}
