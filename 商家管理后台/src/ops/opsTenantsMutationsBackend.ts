/**
 * 运营台 tenants 变更：Service Role 直连；供 Vite 插件与 Vercel API 共用。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

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
  if (typeof body.officialDays === 'number' && Number.isFinite(body.officialDays)) {
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
