import { catalogCustomEntriesOnly, mergeBuiltinAiVendorCatalog } from '../lib/aiVendorCatalogShared'
import type { AiVendorCatalogEntry, RegistryFile } from '../lib/opsRegistryTypes'

const CACHE_KEY = 'meoo_ai_vendor_catalog_custom_v1'

export const MEOO_AI_VENDOR_CATALOG_EVENT = 'meoo-ai-vendor-catalog-synced'

/** 浏览器端：将运营台合并后的完整目录拆成「仅自定义」缓存，供下拉与 pill 使用 */
export function applyAiVendorCatalogFromRegistry(reg: RegistryFile): void {
  const custom = catalogCustomEntriesOnly(reg.aiVendorCatalog ?? [])
  try {
    if (custom.length === 0) localStorage.removeItem(CACHE_KEY)
    else localStorage.setItem(CACHE_KEY, JSON.stringify(custom))
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(MEOO_AI_VENDOR_CATALOG_EVENT))
  } catch {
    /* ignore */
  }
}

function readCachedCustomEntries(): AiVendorCatalogEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw?.trim()) return []
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return []
    return j.filter(
      (x): x is AiVendorCatalogEntry =>
        x && typeof x === 'object' && typeof (x as { id?: string }).id === 'string',
    )
  } catch {
    return []
  }
}

/** 内置 + 同步自定义（用于下拉、系统设置 pills）；首屏无缓存时为完整内置目录。 */
export function listAiUiModelOptions(): { id: string; label: string; hint?: string; logoUrl?: string }[] {
  return mergeBuiltinAiVendorCatalog(readCachedCustomEntries()).map((e) => ({
    id: e.id,
    label: e.label,
    hint: e.hint,
    ...(e.logoUrl ? { logoUrl: e.logoUrl } : {}),
  }))
}
