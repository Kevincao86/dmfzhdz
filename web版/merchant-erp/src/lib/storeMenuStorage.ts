/**
 * 店铺菜单/价目表（按租户 localStorage；图片为 data URL，体积大时建议后续迁 Supabase Storage）。
 */
import { tenantLocalKey } from './tenantLocalState'

const BASE_KEY = 'meoo_store_menu_v1'

export type StoreMenuItem = {
  name: string
  priceYuan?: number
  category?: string
  note?: string
}

export type StoreMenuImage = {
  id: string
  dataUrl: string
  fileName?: string
  recognizedAt?: string
}

export type StoreMenuRecord = {
  id: string
  poiId?: string
  storeName?: string
  images: StoreMenuImage[]
  items: StoreMenuItem[]
  updatedAt: string
}

function storageKey(): string {
  return tenantLocalKey(BASE_KEY)
}

function parseStoreMenuRaw(raw: string | null): StoreMenuRecord | null {
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as StoreMenuRecord
    if (!j || !j.id) return null
    return {
      ...j,
      images: Array.isArray(j.images) ? j.images : [],
      items: Array.isArray(j.items) ? j.items : [],
    }
  } catch {
    return null
  }
}

export function loadStoreMenuRecord(): StoreMenuRecord | null {
  try {
    const keyed = parseStoreMenuRaw(window.localStorage.getItem(storageKey()))
    if (keyed) return keyed
    // 兼容未挂租户 id 时写入的全局键
    if (storageKey() !== BASE_KEY) {
      return parseStoreMenuRaw(window.localStorage.getItem(BASE_KEY))
    }
    return null
  } catch {
    return null
  }
}

export function saveStoreMenuRecord(rec: StoreMenuRecord): void {
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify({ ...rec, updatedAt: new Date().toISOString() }))
  } catch {
    /* quota */
  }
}

export function createEmptyStoreMenuRecord(poiId?: string, storeName?: string): StoreMenuRecord {
  return {
    id: `menu-${Date.now()}`,
    poiId: poiId?.trim() || undefined,
    storeName: storeName?.trim() || undefined,
    images: [],
    items: [],
    updatedAt: new Date().toISOString(),
  }
}

export function menuItemsSummary(items: StoreMenuItem[], max = 40): string {
  const lines = items
    .slice(0, max)
    .map((it) => {
      const p =
        typeof it.priceYuan === 'number' && Number.isFinite(it.priceYuan)
          ? ` ¥${it.priceYuan}`
          : ''
      const cat = it.category ? `[${it.category}] ` : ''
      return `${cat}${it.name}${p}${it.note ? `（${it.note}）` : ''}`
    })
  if (items.length > max) lines.push(`…共 ${items.length} 项，仅展示前 ${max} 项`)
  return lines.join('\n')
}
