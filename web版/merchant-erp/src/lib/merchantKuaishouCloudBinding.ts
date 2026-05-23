/**
 * 快手团购绑定与 Supabase 租户同步（支持同一租户多家来客账号）
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deleteMerchantBindingById,
  listMerchantBindings,
  upsertMerchantBinding,
  type MerchantPlatformBindingRow,
} from './merchantPlatformBindings'
import { fetchPrimaryTenantId } from './tenantBilling'
import { applyActiveKuaishouBinding, pickActiveKuaishouBinding } from './kuaishouActiveBinding'

const PROVIDER = 'kuaishou' as const

export type KuaishouCloudBindingRow = {
  id: string
  sealed_credentials: string
  client_key: string | null
  merchant_account_id: string | null
  account_display_name: string | null
  binding_label: string | null
}

function toLegacy(row: MerchantPlatformBindingRow): KuaishouCloudBindingRow {
  return {
    id: row.id,
    sealed_credentials: row.sealedCredentials,
    client_key: row.clientKey,
    merchant_account_id: row.merchantAccountId,
    account_display_name: row.accountDisplayName,
    binding_label: row.bindingLabel,
  }
}

export async function listKuaishouBindingsCloud(
  supabase: SupabaseClient,
): Promise<KuaishouCloudBindingRow[]> {
  const rows = await listMerchantBindings(supabase, PROVIDER)
  return rows.map(toLegacy)
}

export async function fetchKuaishouBindingCloud(
  supabase: SupabaseClient,
): Promise<KuaishouCloudBindingRow | null> {
  const rows = await listMerchantBindings(supabase, PROVIDER)
  const active = pickActiveKuaishouBinding(rows)
  return active ? toLegacy(active) : null
}

export async function upsertKuaishouBindingCloud(
  supabase: SupabaseClient,
  payload: {
    sealedToken: string
    clientKey: string
    merchantAccountId: string
    accountDisplayName?: string | null
    bindingLabel?: string | null
  },
): Promise<{ ok: true; row: KuaishouCloudBindingRow } | { ok: false; message: string }> {
  const r = await upsertMerchantBinding(supabase, {
    provider: PROVIDER,
    merchantAccountId: payload.merchantAccountId,
    sealedCredentials: payload.sealedToken.trim(),
    clientKey: payload.clientKey,
    accountDisplayName: payload.accountDisplayName,
    bindingLabel: payload.bindingLabel ?? payload.accountDisplayName,
  })
  if (!r.ok) return r
  applyActiveKuaishouBinding(r.row)
  return { ok: true, row: toLegacy(r.row) }
}

export async function deleteKuaishouBindingCloud(
  supabase: SupabaseClient,
  bindingId?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (bindingId) {
    const d = await deleteMerchantBindingById(supabase, bindingId)
    if (!d.ok) return d
    const rows = await listMerchantBindings(supabase, PROVIDER)
    const active = pickActiveKuaishouBinding(rows)
    applyActiveKuaishouBinding(active)
    return { ok: true }
  }
  const rows = await listMerchantBindings(supabase, PROVIDER)
  for (const row of rows) {
    const d = await deleteMerchantBindingById(supabase, row.id)
    if (!d.ok) return d
  }
  applyActiveKuaishouBinding(null)
  return { ok: true }
}

export async function hydrateKuaishouBindingsFromCloud(
  supabase: SupabaseClient,
): Promise<KuaishouCloudBindingRow[]> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) {
    /** 登录/租户尚未就绪：勿清空本机 binding，避免首页探测误删凭证 */
    return []
  }
  const rows = await listMerchantBindings(supabase, PROVIDER)
  const active = pickActiveKuaishouBinding(rows)
  applyActiveKuaishouBinding(active)
  return rows.map(toLegacy)
}
