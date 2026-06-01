/**
 * 服务商版：代运营客户商家账号（tenant_partner_clients）
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MerchantBindingProvider } from './merchantPlatformBindings'
import { fetchPrimaryTenantId } from './tenantBilling'
import { tenantLocalKey } from './tenantLocalState'
import { writeMerchantSession } from './merchantSession'

export type PartnerClientRow = {
  id: string
  provider: MerchantBindingProvider
  merchantAccountId: string
  accountDisplayName: string | null
  clientLabel: string | null
  clientKey: string | null
  sealedCredentials: string
  demoMode: boolean
  updatedAt: string
}

const ACTIVE_CLIENT_KEY = 'meoo_active_partner_client_id'
const ACTIVE_CLIENT_PROVIDER_KEY = 'meoo_active_partner_client_provider'

function parseRow(raw: Record<string, unknown>): PartnerClientRow | null {
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
    clientLabel: typeof raw.client_label === 'string' ? raw.client_label : null,
    clientKey: typeof raw.client_key === 'string' ? raw.client_key : null,
    sealedCredentials: sealed,
    demoMode: Boolean(raw.demo_mode),
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  }
}

export function readActivePartnerClientId(): string | null {
  try {
    const v =
      window.sessionStorage.getItem(tenantLocalKey(ACTIVE_CLIENT_KEY)) ??
      window.localStorage.getItem(tenantLocalKey(ACTIVE_CLIENT_KEY))
    return typeof v === 'string' && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function readActivePartnerClientProvider(): MerchantBindingProvider | null {
  try {
    const v = window.sessionStorage.getItem(tenantLocalKey(ACTIVE_CLIENT_PROVIDER_KEY))
    if (v === 'douyin' || v === 'kuaishou' || v === 'local_promotion' || v === 'xhs_commercial')
      return v
    return null
  } catch {
    return null
  }
}

export function writeActivePartnerClient(
  clientId: string | null,
  provider: MerchantBindingProvider | null,
): void {
  const idKey = tenantLocalKey(ACTIVE_CLIENT_KEY)
  const provKey = tenantLocalKey(ACTIVE_CLIENT_PROVIDER_KEY)
  try {
    if (clientId == null) {
      window.sessionStorage.removeItem(idKey)
      window.sessionStorage.removeItem(provKey)
    } else {
      window.sessionStorage.setItem(idKey, clientId)
      if (provider) window.sessionStorage.setItem(provKey, provider)
    }
  } catch {
    /* ignore */
  }
}

export async function listPartnerClients(
  supabase: SupabaseClient,
  provider?: MerchantBindingProvider,
): Promise<PartnerClientRow[]> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return []
  let q = supabase
    .from('tenant_partner_clients')
    .select(
      'id, provider, merchant_account_id, account_display_name, client_label, client_key, sealed_credentials, demo_mode, updated_at',
    )
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
  if (provider) q = q.eq('provider', provider)
  const { data, error } = await q
  if (error || !data) return []
  return data
    .map((r) => parseRow(r as Record<string, unknown>))
    .filter((x): x is PartnerClientRow => x != null)
}

export async function upsertPartnerClient(
  supabase: SupabaseClient,
  input: {
    provider: MerchantBindingProvider
    merchantAccountId: string
    sealedCredentials: string
    clientKey?: string | null
    accountDisplayName?: string | null
    clientLabel?: string | null
    demoMode?: boolean
    id?: string
  },
): Promise<PartnerClientRow | null> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return null
  const row = {
    tenant_id: tenantId,
    provider: input.provider,
    merchant_account_id: input.merchantAccountId.trim(),
    sealed_credentials: input.sealedCredentials.trim(),
    client_key: input.clientKey ?? null,
    account_display_name: input.accountDisplayName ?? null,
    client_label: input.clientLabel ?? null,
    demo_mode: Boolean(input.demoMode),
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('tenant_partner_clients')
      .update(row)
      .eq('id', input.id)
      .eq('tenant_id', tenantId)
      .select(
        'id, provider, merchant_account_id, account_display_name, client_label, client_key, sealed_credentials, demo_mode, updated_at',
      )
      .maybeSingle()
    if (error || !data) return null
    return parseRow(data as Record<string, unknown>)
  }
  const { data, error } = await supabase
    .from('tenant_partner_clients')
    .upsert(row, { onConflict: 'tenant_id,provider,merchant_account_id' })
    .select(
      'id, provider, merchant_account_id, account_display_name, client_label, client_key, sealed_credentials, demo_mode, updated_at',
    )
    .maybeSingle()
  if (error || !data) return null
  return parseRow(data as Record<string, unknown>)
}

export async function deletePartnerClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<boolean> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return false
  const { error } = await supabase
    .from('tenant_partner_clients')
    .delete()
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
  return !error
}

const DOUYIN_TOKEN = 'meoo_douyin_merchant_token'
const DOUYIN_APP = 'meoo_douyin_app_id'
const DOUYIN_MID = 'meoo_douyin_merchant_id'
const DOUYIN_NAME = 'meoo_douyin_account_name'

const KUAISHOU_TOKEN = 'meoo_kuaishou_merchant_token'
const KUAISHOU_APP = 'meoo_kuaishou_app_id'
const KUAISHOU_MID = 'meoo_kuaishou_merchant_id'
const KUAISHOU_NAME = 'meoo_kuaishou_account_name'

/** 将客户商家绑定写入当前会话（供商品/门店 API 使用） */
export function applyActivePartnerClient(row: PartnerClientRow | null): void {
  if (!row) {
    writeActivePartnerClient(null, null)
    return
  }
  writeActivePartnerClient(row.id, row.provider)
  const label = row.clientLabel || row.accountDisplayName || row.merchantAccountId
  if (row.provider === 'douyin') {
    writeMerchantSession(DOUYIN_TOKEN, row.sealedCredentials)
    writeMerchantSession(DOUYIN_APP, row.clientKey ?? '')
    writeMerchantSession(DOUYIN_MID, row.merchantAccountId)
    writeMerchantSession(DOUYIN_NAME, label)
  } else if (row.provider === 'kuaishou') {
    writeMerchantSession(KUAISHOU_TOKEN, row.sealedCredentials)
    writeMerchantSession(KUAISHOU_APP, row.clientKey ?? '')
    writeMerchantSession(KUAISHOU_MID, row.merchantAccountId)
    writeMerchantSession(KUAISHOU_NAME, label)
  }
}

export function pickActivePartnerClient(
  rows: PartnerClientRow[],
  provider?: MerchantBindingProvider,
): PartnerClientRow | null {
  const filtered = provider ? rows.filter((r) => r.provider === provider) : rows
  if (filtered.length === 0) return null
  const activeId = readActivePartnerClientId()
  const activeProv = readActivePartnerClientProvider()
  if (activeId && (!provider || activeProv === provider)) {
    const found = filtered.find((r) => r.id === activeId)
    if (found) return found
  }
  return filtered[0] ?? null
}
