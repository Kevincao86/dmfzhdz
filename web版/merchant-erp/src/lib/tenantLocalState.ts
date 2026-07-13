/**
 * 切换 Supabase 商户账号时清理浏览器内未按租户隔离的本地态，避免串租户数据。
 * 平台绑定（抖音/快手）仅在用户主动解绑或切换账号/退出时清除；登录与 Token 刷新不得清空。
 */
import {
  clearDouyinMerchantBindingLocal,
  clearKuaishouMerchantBindingLocal,
} from './merchantSession'
import {
  MEOO_MERCHANT_DISPLAY_NAME_KEY,
  MEOO_OFFICIAL_REMAINING_DAYS_KEY,
  MEOO_TRIAL_SNAPSHOT_KEY,
} from './opsRegistryConstants'

/** 当前登录商户租户 id（sessionStorage，供同步读写的 localStorage 键加后缀） */
export const MEOO_ACTIVE_TENANT_ID_KEY = 'meoo_active_tenant_id'

const EXTRA_LOCAL_KEYS = [
  MEOO_MERCHANT_DISPLAY_NAME_KEY,
  MEOO_TRIAL_SNAPSHOT_KEY,
  MEOO_OFFICIAL_REMAINING_DAYS_KEY,
  'meoo_product_edit_library_v1',
  'meoo_product_draft_snapshots_v1',
  'meoo_kol_brief_records',
  'meoo_viral_brief_gen_records',
  'meoo_kol_selected_brief_payload',
  'meoo_merchant_ai_vendor_keys_v1',
  'meoo_last_recruitment_order_id',
  'meoo_last_recruitment_submit',
  'meoo_recruitment_create_draft_v1',
  'meoo_store_menu_v1',
  'meoo_store_menu_items_v1',
  'meoo_competitor_reports_v1',
  'meoo_competitor_selected_poi_v1',
] as const

/** 各平台商家/投流绑定 session（未加 @tenant 的旧键，登出时一并清除） */
const PLATFORM_SESSION_KEYS = [
  'meoo_meituan_merchant_token',
  'meoo_meituan_auto_refresh',
  'meoo_meituan_app_id',
  'meoo_xhs_merchant_token',
  'meoo_xhs_auto_refresh',
  'meoo_xhs_app_id',
  'meoo_local_promotion_bind',
  'meoo_xhs_commercial_bind',
  'meoo_active_douyin_binding_id',
  'meoo_active_local_promotion_binding_id',
  'meoo_active_xhs_commercial_binding_id',
  'meoo_sub_accounts_v1',
  'meoo_job_roles_v1',
] as const

export function setActiveTenantStorageId(tenantId: string | null): void {
  try {
    if (tenantId?.trim()) sessionStorage.setItem(MEOO_ACTIVE_TENANT_ID_KEY, tenantId.trim())
    else sessionStorage.removeItem(MEOO_ACTIVE_TENANT_ID_KEY)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('meoo-active-tenant-changed', { detail: tenantId }))
    }
  } catch {
    /* ignore */
  }
}

export function getActiveTenantStorageId(): string | null {
  try {
    const v = sessionStorage.getItem(MEOO_ACTIVE_TENANT_ID_KEY)?.trim()
    return v || null
  } catch {
    return null
  }
}

/** 按当前租户隔离的 localStorage 键（未登录时退回全局键，登录后应立即 setActiveTenantStorageId） */
export function tenantLocalKey(base: string): string {
  const tid = getActiveTenantStorageId()
  return tid ? `${base}@${tid}` : base
}

function removeStorageKey(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    /* ignore */
  }
}

const PLATFORM_BINDING_KEY_MARKERS = [
  'meoo_douyin_',
  'meoo_kuaishou_',
  'meoo_active_douyin_binding_id',
  'meoo_active_kuaishou_binding_id',
  'meoo_douyin_cloud_backup_attempted',
  'meoo_kuaishou_cloud_backup_attempted',
] as const

/** 平台商家后台绑定凭据：登录/刷新会话时不得删除 */
export function isPlatformBindingStorageKey(key: string): boolean {
  return PLATFORM_BINDING_KEY_MARKERS.some((m) => key === m || key.startsWith(m) || key.includes(`@${m}`))
}

export function clearPlatformBindingLocalState(): void {
  clearDouyinMerchantBindingLocal()
  clearKuaishouMerchantBindingLocal()
}

function purgeMeooStorageExceptBindings(storage: Storage): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (!k) continue
      if (!k.includes('@') && !k.startsWith('meoo_')) continue
      if (isPlatformBindingStorageKey(k)) continue
      keys.push(k)
    }
    for (const k of keys) removeStorageKey(storage, k)
  } catch {
    /* ignore */
  }
}

/** 仅清草稿/缓存，保留抖音快手等平台绑定 */
export function clearTenantDraftBrowserState(): void {
  try {
    sessionStorage.removeItem(MEOO_ACTIVE_TENANT_ID_KEY)
  } catch {
    /* ignore */
  }
  for (const k of [...EXTRA_LOCAL_KEYS, ...PLATFORM_SESSION_KEYS]) {
    if (isPlatformBindingStorageKey(k)) continue
    removeStorageKey(window.localStorage, k)
    removeStorageKey(window.sessionStorage, k)
  }
  purgeMeooStorageExceptBindings(window.localStorage)
  purgeMeooStorageExceptBindings(window.sessionStorage)
}

/** 切换账号 / 退出登录：清草稿并清平台绑定本机副本（云端 tenant_merchant_bindings 仍保留） */
export function clearTenantScopedBrowserState(): void {
  clearPlatformBindingLocalState()
  clearTenantDraftBrowserState()
}

/** 大陆 11 位手机号脱敏展示 */
export function maskCnPhone(raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}****${digits.slice(7)}`
  if (digits.length === 13 && digits.startsWith('86')) {
    return `${digits.slice(2, 5)}****${digits.slice(9)}`
  }
  return digits ? `${digits.slice(0, 3)}****` : '—'
}

export function phoneFromAuthUser(user: {
  phone?: string | null
  user_metadata?: { phone?: string } | null
}): string {
  const meta = user.user_metadata?.phone
  if (typeof meta === 'string' && meta.trim()) return meta.replace(/\D/g, '').replace(/^86/, '')
  const p = user.phone
  if (typeof p === 'string' && p.trim()) {
    const d = p.replace(/\D/g, '')
    return d.startsWith('86') && d.length === 13 ? d.slice(2) : d
  }
  return ''
}
