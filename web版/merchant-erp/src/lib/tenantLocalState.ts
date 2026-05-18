/**
 * 切换 Supabase 商户账号时清理浏览器内未按租户隔离的本地态，避免串租户数据。
 */
import { clearDouyinMerchantBindingLocal } from './merchantSession'
import {
  MEOO_MERCHANT_DISPLAY_NAME_KEY,
  MEOO_OFFICIAL_REMAINING_DAYS_KEY,
  MEOO_TRIAL_SNAPSHOT_KEY,
} from './opsRegistryConstants'

const EXTRA_LOCAL_KEYS = [
  MEOO_MERCHANT_DISPLAY_NAME_KEY,
  MEOO_TRIAL_SNAPSHOT_KEY,
  MEOO_OFFICIAL_REMAINING_DAYS_KEY,
  'meoo_product_edit_library_v1',
  'meoo_kol_brief_records',
  'meoo_kol_selected_brief_payload',
  'meoo_merchant_ai_vendor_keys_v1',
] as const

export function clearTenantScopedBrowserState(): void {
  clearDouyinMerchantBindingLocal()
  for (const k of EXTRA_LOCAL_KEYS) {
    try {
      window.localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
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
