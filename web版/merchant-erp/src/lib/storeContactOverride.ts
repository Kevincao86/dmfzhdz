/**
 * 平台未返回营业电话 / 营业时间时，商户可在本机按租户手填补充（列表、详情、GEO 共用）。
 * 平台有值时优先用平台；仅缺省字段才用手动覆盖。
 */
import type { DouyinStoreRow } from '../services/douyinMerchantApi'
import { tenantLocalKey } from './tenantLocalState'

export const STORE_CONTACT_OVERRIDE_KEY = 'meoo_store_contact_override_v1'

export type StoreContactOverride = {
  phone?: string
  businessHours?: string
  updatedAt: string
}

function storageKey(): string {
  return tenantLocalKey(STORE_CONTACT_OVERRIDE_KEY)
}

export function storeContactEntryKey(platform: string, poiId: string): string {
  return `${String(platform || '').trim()}:${String(poiId || '').trim()}`
}

export function loadStoreContactOverrides(): Record<string, StoreContactOverride> {
  try {
    const raw = window.localStorage.getItem(storageKey())
    if (!raw) return {}
    const j = JSON.parse(raw) as Record<string, unknown>
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {}
    const out: Record<string, StoreContactOverride> = {}
    for (const [k, v] of Object.entries(j)) {
      if (!k || !v || typeof v !== 'object' || Array.isArray(v)) continue
      const o = v as Record<string, unknown>
      const phone = typeof o.phone === 'string' ? o.phone.trim() : ''
      const businessHours = typeof o.businessHours === 'string' ? o.businessHours.trim() : ''
      const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : ''
      if (!phone && !businessHours) continue
      out[k] = {
        ...(phone ? { phone } : {}),
        ...(businessHours ? { businessHours } : {}),
        updatedAt: updatedAt || new Date().toISOString(),
      }
    }
    return out
  } catch {
    return {}
  }
}

export function getStoreContactOverride(
  platform: string,
  poiId: string,
): StoreContactOverride | null {
  const all = loadStoreContactOverrides()
  return all[storeContactEntryKey(platform, poiId)] ?? null
}

export function saveStoreContactOverride(
  platform: string,
  poiId: string,
  patch: { phone?: string; businessHours?: string },
): StoreContactOverride | null {
  const key = storeContactEntryKey(platform, poiId)
  if (!String(poiId || '').trim()) return null
  const phone = typeof patch.phone === 'string' ? patch.phone.trim() : ''
  const businessHours = typeof patch.businessHours === 'string' ? patch.businessHours.trim() : ''
  const all = loadStoreContactOverrides()
  if (!phone && !businessHours) {
    delete all[key]
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(all))
    } catch {
      /* ignore */
    }
    return null
  }
  const next: StoreContactOverride = {
    ...(phone ? { phone } : {}),
    ...(businessHours ? { businessHours } : {}),
    updatedAt: new Date().toISOString(),
  }
  all[key] = next
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(all))
  } catch {
    /* ignore */
  }
  return next
}

/** 平台缺省时补上手填；平台已有值不覆盖 */
export function mergeStoreContactOverride(
  platform: string,
  row: DouyinStoreRow,
  overrides?: Record<string, StoreContactOverride>,
): DouyinStoreRow {
  const map = overrides ?? loadStoreContactOverrides()
  const ov = map[storeContactEntryKey(platform, row.id)]
  if (!ov) return row
  const phoneFromApi = row.phone?.trim()
  const hoursFromApi = row.businessHours?.trim()
  const phone = phoneFromApi || ov.phone?.trim() || undefined
  const businessHours = hoursFromApi || ov.businessHours?.trim() || undefined
  if (phone === row.phone && businessHours === row.businessHours) return row
  return {
    ...row,
    ...(phone ? { phone } : {}),
    ...(businessHours ? { businessHours } : {}),
  }
}

export function applyStoreContactOverrides(
  platform: string,
  items: DouyinStoreRow[],
): DouyinStoreRow[] {
  if (!items.length) return items
  const map = loadStoreContactOverrides()
  if (!Object.keys(map).length) return items
  return items.map((row) => mergeStoreContactOverride(platform, row, map))
}

export function storeContactNeedsManualFill(row: DouyinStoreRow): boolean {
  return !row.phone?.trim() || !row.businessHours?.trim()
}
