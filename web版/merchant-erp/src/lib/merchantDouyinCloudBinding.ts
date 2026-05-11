/**
 * 抖音来客绑定与 Supabase 租户同步：换设备登录同一商户账号后自动恢复绑定（密文 token 存云端）。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPrimaryTenantId } from './tenantBilling'

const PROVIDER = 'douyin' as const

export type DouyinCloudBindingRow = {
  sealed_credentials: string
  client_key: string | null
  merchant_account_id: string | null
  account_display_name: string | null
}

export async function fetchDouyinBindingCloud(
  supabase: SupabaseClient,
): Promise<DouyinCloudBindingRow | null> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return null
  const { data, error } = await supabase
    .from('tenant_merchant_bindings')
    .select('sealed_credentials, client_key, merchant_account_id, account_display_name')
    .eq('tenant_id', tenantId)
    .eq('provider', PROVIDER)
    .maybeSingle()
  if (error || !data) return null
  const sealed =
    typeof data.sealed_credentials === 'string' ? data.sealed_credentials.trim() : ''
  if (!sealed) return null
  return {
    sealed_credentials: sealed,
    client_key: typeof data.client_key === 'string' ? data.client_key : null,
    merchant_account_id:
      typeof data.merchant_account_id === 'string' ? data.merchant_account_id : null,
    account_display_name:
      typeof data.account_display_name === 'string' ? data.account_display_name : null,
  }
}

export async function upsertDouyinBindingCloud(
  supabase: SupabaseClient,
  payload: {
    sealedToken: string
    clientKey: string
    merchantAccountId: string
    accountDisplayName?: string | null
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return { ok: false, message: '当前账号未关联商户租户，无法写入云端绑定' }

  const row = {
    tenant_id: tenantId,
    provider: PROVIDER,
    sealed_credentials: payload.sealedToken.trim(),
    client_key: payload.clientKey.trim() || null,
    merchant_account_id: payload.merchantAccountId.trim() || null,
    account_display_name: payload.accountDisplayName?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('tenant_merchant_bindings').upsert(row, {
    onConflict: 'tenant_id,provider',
  })
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}

export async function deleteDouyinBindingCloud(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return { ok: true }
  const { error } = await supabase
    .from('tenant_merchant_bindings')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('provider', PROVIDER)
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}
