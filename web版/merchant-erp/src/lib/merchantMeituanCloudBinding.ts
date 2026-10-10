/**
 * 美团团购绑定与租户云端同步。演示令牌不入库，避免电脑端和小程序读到假门店。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPrimaryTenantId } from './tenantBilling'
import {
  listMerchantBindings,
  upsertMerchantBinding,
  type MerchantPlatformBindingRow,
} from './merchantPlatformBindings'
import { applyActiveMeituanBinding, pickActiveMeituanBinding } from './meituanActiveBinding'
import { clearMeituanMerchantBindingLocal, readMerchantSession } from './merchantSession'
import { tenantLocalKey } from './tenantLocalState'

const TOKEN_KEY = 'meoo_meituan_merchant_token'
const META_APP_ID = 'meoo_meituan_app_id'
const META_MERCHANT_ID = 'meoo_meituan_merchant_id'
const META_ACCOUNT_NAME = 'meoo_meituan_account_name'
const CLOUD_BACKUP_ATTEMPTED_BASE = 'meoo_meituan_cloud_backup_attempted'
const SESSION_PREFIX = 'meoo_mt1.'
const PROVIDER = 'meituan' as const

export type MeituanGroupbuySessionMeta = {
  merchantId: string
  appKey: string
  demo: boolean
}

function decodeBase64Url(payload: string): string {
  const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4))
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** 解析绑定令牌里的商户号。演示会话返回 demo=true，调用方不得当作真实团购数据。 */
export function readMeituanGroupbuySessionMeta(token: string): MeituanGroupbuySessionMeta | null {
  const raw = token.trim()
  if (!raw.startsWith(SESSION_PREFIX)) return null
  try {
    const j = JSON.parse(decodeBase64Url(raw.slice(SESSION_PREFIX.length))) as {
      v?: number
      appKey?: string
      merchantId?: string
      demo?: boolean
    }
    if (j?.v !== 1 || !j.appKey || !j.merchantId) return null
    return { merchantId: j.merchantId, appKey: j.appKey, demo: j.demo === true }
  } catch {
    return null
  }
}

export async function upsertMeituanBindingCloud(
  supabase: SupabaseClient,
  payload: {
    sealedToken: string
    clientKey: string
    merchantAccountId: string
    accountDisplayName?: string | null
    bindingLabel?: string | null
    demoMode?: boolean
  },
): Promise<{ ok: true; row: MerchantPlatformBindingRow } | { ok: false; message: string }> {
  if (payload.demoMode) {
    return { ok: false, message: '演示会话不能写入美团团购云端绑定' }
  }
  const r = await upsertMerchantBinding(supabase, {
    provider: PROVIDER,
    merchantAccountId: payload.merchantAccountId,
    sealedCredentials: payload.sealedToken.trim(),
    clientKey: payload.clientKey,
    accountDisplayName: payload.accountDisplayName,
    bindingLabel: payload.bindingLabel ?? payload.accountDisplayName,
    demoMode: false,
  })
  if (!r.ok) return r
  applyActiveMeituanBinding(r.row)
  return r
}

export async function hydrateMeituanBindingsFromCloud(
  supabase: SupabaseClient,
): Promise<MerchantPlatformBindingRow[]> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return []

  const rows = await listMerchantBindings(supabase, PROVIDER)
  const liveRows = rows.filter((row) => !row.demoMode)
  if (liveRows.length > 0) {
    const active = pickActiveMeituanBinding(liveRows)
    if (active) applyActiveMeituanBinding(active)
    return liveRows
  }

  const tok = readMerchantSession(TOKEN_KEY)?.trim() ?? ''
  const meta = tok ? readMeituanGroupbuySessionMeta(tok) : null
  if (!tok || !meta || meta.demo) {
    if (tok && meta?.demo) clearMeituanMerchantBindingLocal()
    return []
  }

  const merchantId = readMerchantSession(META_MERCHANT_ID)?.trim() || meta.merchantId
  let attempted = false
  try {
    attempted = localStorage.getItem(tenantLocalKey(CLOUD_BACKUP_ATTEMPTED_BASE)) === '1'
  } catch {
    /* ignore */
  }
  if (attempted) return []
  try {
    localStorage.setItem(tenantLocalKey(CLOUD_BACKUP_ATTEMPTED_BASE), '1')
  } catch {
    /* ignore */
  }
  const accountName = readMerchantSession(META_ACCOUNT_NAME)
  const cr = await upsertMeituanBindingCloud(supabase, {
    sealedToken: tok,
    clientKey: readMerchantSession(META_APP_ID) ?? meta.appKey,
    merchantAccountId: merchantId,
    accountDisplayName: accountName,
    bindingLabel: accountName,
    demoMode: false,
  })
  return cr.ok ? [cr.row] : []
}
