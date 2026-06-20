/**
 * 租户级多平台、多账号绑定（Supabase tenant_merchant_bindings）
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { platformBindingRole } from './appEdition'
import { fetchPrimaryTenantId } from './tenantBilling'
import { readMerchantSession, writeMerchantSession } from './merchantSession'
import { tenantLocalKey } from './tenantLocalState'

export type MerchantBindingProvider = 'douyin' | 'kuaishou' | 'local_promotion' | 'xhs_commercial'

export type MerchantPlatformBindingRow = {
  id: string
  provider: MerchantBindingProvider
  merchantAccountId: string
  accountDisplayName: string | null
  bindingLabel: string | null
  clientKey: string | null
  sealedCredentials: string
  demoMode: boolean
  updatedAt: string
}

const ACTIVE_ID_KEY: Record<MerchantBindingProvider, string> = {
  douyin: 'meoo_active_douyin_binding_id',
  kuaishou: 'meoo_active_kuaishou_binding_id',
  local_promotion: 'meoo_active_local_promotion_binding_id',
  xhs_commercial: 'meoo_active_xhs_commercial_binding_id',
}

function parseRow(raw: Record<string, unknown>): MerchantPlatformBindingRow | null {
  const id = typeof raw.id === 'string' ? raw.id : ''
  const provider =
    raw.provider === 'local_promotion'
      ? 'local_promotion'
      : raw.provider === 'xhs_commercial'
        ? 'xhs_commercial'
        : raw.provider === 'kuaishou'
          ? 'kuaishou'
        : raw.provider === 'douyin'
          ? 'douyin'
          : null
  const sealed =
    typeof raw.sealed_credentials === 'string' ? raw.sealed_credentials.trim() : ''
  const merchantAccountId =
    typeof raw.merchant_account_id === 'string' ? raw.merchant_account_id.trim() : ''
  if (!id || !provider || !sealed || !merchantAccountId) return null
  return {
    id,
    provider,
    merchantAccountId,
    accountDisplayName:
      typeof raw.account_display_name === 'string' ? raw.account_display_name : null,
    bindingLabel: typeof raw.binding_label === 'string' ? raw.binding_label : null,
    clientKey: typeof raw.client_key === 'string' ? raw.client_key : null,
    sealedCredentials: sealed,
    demoMode: Boolean(raw.demo_mode),
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  }
}

function activeBindingStorageKey(provider: MerchantBindingProvider): string {
  return tenantLocalKey(ACTIVE_ID_KEY[provider])
}

export function readActiveBindingId(provider: MerchantBindingProvider): string | null {
  const key = activeBindingStorageKey(provider)
  try {
    const v = window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key)
    return typeof v === 'string' && v.trim() ? v.trim() : null
  } catch {
    return readMerchantSession(ACTIVE_ID_KEY[provider])
  }
}

export function writeActiveBindingId(
  provider: MerchantBindingProvider,
  bindingId: string | null,
): void {
  const key = activeBindingStorageKey(provider)
  try {
    if (bindingId == null) {
      window.sessionStorage.removeItem(key)
      window.localStorage.removeItem(key)
    } else {
      window.sessionStorage.setItem(key, bindingId)
      window.localStorage.setItem(key, bindingId)
    }
  } catch {
    /* ignore */
  }
  writeMerchantSession(ACTIVE_ID_KEY[provider], bindingId)
}

export async function listMerchantBindings(
  supabase: SupabaseClient,
  provider: MerchantBindingProvider,
): Promise<MerchantPlatformBindingRow[]> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return []
  const { data, error } = await supabase
    .from('tenant_merchant_bindings')
    .select(
      'id, provider, merchant_account_id, account_display_name, binding_label, client_key, sealed_credentials, demo_mode, updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('binding_role', platformBindingRole())
    .order('updated_at', { ascending: false })
  if (error || !data) return []
  return data
    .map((r) => parseRow(r as Record<string, unknown>))
    .filter((x): x is MerchantPlatformBindingRow => x != null)
}

export async function upsertMerchantBinding(
  supabase: SupabaseClient,
  input: {
    provider: MerchantBindingProvider
    merchantAccountId: string
    sealedCredentials: string
    clientKey?: string | null
    accountDisplayName?: string | null
    bindingLabel?: string | null
    demoMode?: boolean
  },
): Promise<{ ok: true; row: MerchantPlatformBindingRow } | { ok: false; message: string }> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return { ok: false, message: '当前账号未关联商户租户' }

  const merchantAccountId = input.merchantAccountId.trim()
  if (!merchantAccountId) return { ok: false, message: '请填写平台账号 ID' }

  const row = {
    tenant_id: tenantId,
    provider: input.provider,
    binding_role: platformBindingRole(),
    merchant_account_id: merchantAccountId,
    sealed_credentials: input.sealedCredentials.trim(),
    client_key: input.clientKey?.trim() || null,
    account_display_name: input.accountDisplayName?.trim() || null,
    binding_label: input.bindingLabel?.trim() || null,
    demo_mode: Boolean(input.demoMode),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('tenant_merchant_bindings')
    .upsert(row, { onConflict: 'tenant_id,provider,merchant_account_id' })
    .select(
      'id, provider, merchant_account_id, account_display_name, binding_label, client_key, sealed_credentials, demo_mode, updated_at',
    )
    .single()

  if (error || !data) return { ok: false, message: error?.message ?? '写入失败' }
  const parsed = parseRow(data as Record<string, unknown>)
  if (!parsed) return { ok: false, message: '写入结果异常' }
  return { ok: true, row: parsed }
}

export async function deleteMerchantBindingById(
  supabase: SupabaseClient,
  bindingId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return { ok: true }
  const { error } = await supabase
    .from('tenant_merchant_bindings')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', bindingId)
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}

export async function fetchMerchantBindingById(
  supabase: SupabaseClient,
  bindingId: string,
): Promise<MerchantPlatformBindingRow | null> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return null
  const { data, error } = await supabase
    .from('tenant_merchant_bindings')
    .select(
      'id, provider, merchant_account_id, account_display_name, binding_label, client_key, sealed_credentials, demo_mode, updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', bindingId)
    .maybeSingle()
  if (error || !data) return null
  return parseRow(data as Record<string, unknown>)
}

export type LocalPromotionStoredCredentials = {
  accessToken: string
  appId: string
  appSecret?: string
  refreshToken?: string
  tokenExpiresAt?: string
}

/** 本地推凭证 JSON 存 sealed_credentials */
export function packLocalPromotionCredentials(input: {
  accessToken: string
  appId?: string
  appSecret?: string
  refreshToken?: string
  tokenExpiresAt?: string
}): string {
  return JSON.stringify({
    accessToken: input.accessToken.trim(),
    appId: input.appId?.trim() ?? '',
    appSecret: input.appSecret?.trim() || undefined,
    refreshToken: input.refreshToken?.trim() || undefined,
    tokenExpiresAt: input.tokenExpiresAt?.trim() || undefined,
    v: 2,
  })
}

export function unpackLocalPromotionCredentials(
  sealed: string,
): LocalPromotionStoredCredentials | null {
  try {
    const o = JSON.parse(sealed) as {
      accessToken?: string
      appId?: string
      appSecret?: string
      refreshToken?: string
      tokenExpiresAt?: string
    }
    const accessToken = typeof o.accessToken === 'string' ? o.accessToken.trim() : ''
    if (!accessToken) return null
    return {
      accessToken,
      appId: typeof o.appId === 'string' ? o.appId : '',
      appSecret: typeof o.appSecret === 'string' ? o.appSecret : undefined,
      refreshToken: typeof o.refreshToken === 'string' ? o.refreshToken : undefined,
      tokenExpiresAt: typeof o.tokenExpiresAt === 'string' ? o.tokenExpiresAt : undefined,
    }
  } catch {
    return null
  }
}

/** 小红书聚光/种小草共用凭证 */
export function packXhsCommercialCredentials(input: {
  accessToken: string
  appId?: string
}): string {
  return JSON.stringify({
    accessToken: input.accessToken.trim(),
    appId: input.appId?.trim() ?? '',
    v: 1,
  })
}

export function unpackXhsCommercialCredentials(
  sealed: string,
): { accessToken: string; appId: string } | null {
  try {
    const o = JSON.parse(sealed) as { accessToken?: string; appId?: string }
    const accessToken = typeof o.accessToken === 'string' ? o.accessToken.trim() : ''
    if (!accessToken) return null
    return { accessToken, appId: typeof o.appId === 'string' ? o.appId : '' }
  } catch {
    return null
  }
}
