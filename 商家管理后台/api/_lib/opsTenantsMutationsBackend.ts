/**
 * 运营台 tenants 变更：Service Role 直连；供 Vite 插件与 Vercel API 共用。
 * 置于 api 根目录，避免 Vercel Serverless 打包后 api/lib 相对路径解析失败。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { probeTokenMixUsage } from '../../../web版/merchant-erp/vite-plugins/tokenmixUsageProbe.js'
import { ensureErpMonthlyGiftPointsGranted } from '../../../web版/merchant-erp/src/lib/erpPointsCore.js'
import { normalizeMembershipPlan } from '../../../web版/merchant-erp/src/lib/membershipPlan.js'
import { buildOpsGiftDaysPatch, readEntitlementDays } from './tenantEntitlementCore.js'

export type TenantMutationResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> }

export async function opsTenantPatchAdmin(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<TenantMutationResult> {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_id' } }
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (typeof body.merchantName === 'string' && body.merchantName.trim())
    patch.name = body.merchantName.trim()
  if (body.accountStatus === 'normal' || body.accountStatus === 'disabled' || body.accountStatus === 'frozen') {
    patch.account_status = body.accountStatus
  }
  if (typeof body.trialDays === 'number' && Number.isFinite(body.trialDays)) {
    patch.trial_days = Math.max(0, Math.min(3650, Math.floor(body.trialDays)))
  }
  if (body.membershipPlan === 'free' || body.membershipPlan === 'member' || body.membershipPlan === 'member_plus') {
    patch.membership_plan = body.membershipPlan
  }
  const planChanged =
    body.membershipPlan === 'free' ||
    body.membershipPlan === 'member' ||
    body.membershipPlan === 'member_plus'

  const giftProvided = typeof body.opsGiftDays === 'number' && Number.isFinite(body.opsGiftDays)
  if (giftProvided) {
    const { data: tenant, error: loadErr } = await admin
      .from('tenants')
      .select('service_expire_at, subscription_days, ops_gift_days, official_days')
      .eq('id', id)
      .maybeSingle()
    if (loadErr || !tenant) {
      return {
        ok: false,
        status: 502,
        body: { ok: false, error: 'tenant_load_failed', detail: loadErr?.message ?? 'not_found' },
      }
    }
    const sub = readEntitlementDays(
      tenant.subscription_days != null ? tenant.subscription_days : tenant.official_days,
    )
    const oldGift = readEntitlementDays(tenant.ops_gift_days)
    const ent = buildOpsGiftDaysPatch({
      subscriptionDays: sub,
      oldOpsGiftDays: oldGift,
      newOpsGiftDays: body.opsGiftDays as number,
      serviceExpireAt:
        typeof tenant.service_expire_at === 'string' ? tenant.service_expire_at : null,
    })
    Object.assign(patch, ent)
  } else if (typeof body.officialDays === 'number' && Number.isFinite(body.officialDays)) {
    patch.official_days = Math.max(0, Math.min(36500, Math.floor(body.officialDays)))
  }

  const { error } = await admin.from('tenants').update(patch).eq('id', id)
  if (error) {
    return {
      ok: false,
      status: 502,
      body: { ok: false, error: 'patch_failed', detail: error.message },
    }
  }

  // 运营改档后立即按新档补发/补差当月套餐桶积分（避免「已是 Plus 但积分仍是免费档余额」）
  if (planChanged) {
    try {
      await ensureErpMonthlyGiftPointsGranted(admin, id, {
        plan: normalizeMembershipPlan(String(body.membershipPlan)),
      })
    } catch {
      /* 积分补发失败不阻断改档；商户打开钱包时会再走 ensure */
    }
  }

  return { ok: true }
}

export async function opsTenantResetPasswordAdmin(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<TenantMutationResult> {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_id' } }
  }
  const rawPw = typeof body.password === 'string' ? body.password : ''
  const password = rawPw.length >= 6 ? rawPw : '123456'

  const { data: members, error: me } = await admin
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', id)
    .eq('role', 'owner')
    .limit(1)
  if (me) {
    return {
      ok: false,
      status: 502,
      body: { ok: false, error: 'members_lookup_failed', detail: me.message },
    }
  }
  const uid = members?.[0]?.user_id
  if (!uid || typeof uid !== 'string') {
    return { ok: false, status: 404, body: { ok: false, error: 'owner_not_found' } }
  }
  const { error: ue } = await admin.auth.admin.updateUserById(uid, { password })
  if (ue) {
    return {
      ok: false,
      status: 502,
      body: { ok: false, error: 'auth_update_failed', detail: ue.message },
    }
  }
  return { ok: true }
}

export async function opsTenantWalletLedgerAdmin(
  admin: SupabaseClient,
  tenantId: string,
): Promise<
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_tenant_id' } }
  }
  const { data: ledgerRows, error: le } = await admin
    .from('tenant_wallet_ledger')
    .select('id, tenant_id, delta_cents, balance_after_cents, reason, ref_order_id, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (le) {
    return {
      ok: false,
      status: 502,
      body: {
        ok: false,
        error: 'wallet_ledger_select_failed',
        detail: le.message,
      },
    }
  }
  return { ok: true, rows: ledgerRows ?? [] }
}

export async function opsTenantTokenmixAdmin(
  admin: SupabaseClient,
  body: Record<string, unknown>,
  env: Record<string, string>,
): Promise<TenantMutationResult | { ok: true; body: Record<string, unknown> }> {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_id' } }
  }
  const action = typeof body.action === 'string' ? body.action.trim() : ''

  if (action === 'bind') {
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    if (apiKey.length < 8) {
      return { ok: false, status: 400, body: { ok: false, error: 'invalid_api_key' } }
    }
    const { error } = await admin
      .from('tenants')
      .update({ tokenmix_api_key: apiKey, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      return { ok: false, status: 502, body: { ok: false, error: 'bind_failed', detail: error.message } }
    }
    return { ok: true, body: { ok: true, bound: true } }
  }

  if (action === 'usage') {
    const { data, error } = await admin
      .from('tenants')
      .select(
        'membership_plan, tokenmix_api_key, direct_ai_calls_used, direct_ai_usage_month, tokenmix_usage_snapshot',
      )
      .eq('id', id)
      .maybeSingle()
    if (error || !data) {
      return {
        ok: false,
        status: 404,
        body: { ok: false, error: 'tenant_not_found', detail: error?.message },
      }
    }
    const key =
      typeof data.tokenmix_api_key === 'string' && data.tokenmix_api_key.trim()
        ? data.tokenmix_api_key.trim()
        : ''
    let tokenmixUsage = data.tokenmix_usage_snapshot as Record<string, unknown> | null
    if (key) {
      const snap = await probeTokenMixUsage(key, env)
      tokenmixUsage = snap as unknown as Record<string, unknown>
      await admin
        .from('tenants')
        .update({ tokenmix_usage_snapshot: snap, updated_at: new Date().toISOString() })
        .eq('id', id)
    }
    return {
      ok: true,
      body: {
        ok: true,
        membershipPlan: data.membership_plan,
        tokenmixBound: !!key,
        directAiCallsUsed: data.direct_ai_calls_used ?? 0,
        directAiUsageMonth: data.direct_ai_usage_month,
        tokenmixUsage,
      },
    }
  }

  return { ok: false, status: 400, body: { ok: false, error: 'invalid_action' } }
}
