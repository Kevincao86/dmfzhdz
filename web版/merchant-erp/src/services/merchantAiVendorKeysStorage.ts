import { isValidAiVendorSlug } from '../lib/aiVendorCatalogShared'

const STORAGE_KEY = 'meoo_merchant_ai_vendor_keys_v1'

export type VendorKeyMap = Partial<Record<string, string>>

export type VendorKeyModelId = string

export function readVendorKeyMap(): VendorKeyMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw?.trim()) return {}
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {}
    const o = j as Record<string, unknown>
    const out: VendorKeyMap = {}
    for (const [id, v] of Object.entries(o)) {
      if (!isValidAiVendorSlug(id)) continue
      if (typeof v !== 'string' || !v.trim()) continue
      out[id] = v.trim()
    }
    return out
  } catch {
    return {}
  }
}

/** 合并写入；传空字符串可清除该 slug 的 Key */
export function patchVendorKeyMap(patch: Partial<Record<string, string>>): void {
  const prev = readVendorKeyMap()
  const next: VendorKeyMap = { ...prev }
  for (const [id, v] of Object.entries(patch)) {
    if (!isValidAiVendorSlug(id)) continue
    if (v === undefined) continue
    const t = v.trim()
    if (t) next[id] = t
    else delete next[id]
  }
  try {
    if (Object.keys(next).length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function clearVendorKeyMap(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
