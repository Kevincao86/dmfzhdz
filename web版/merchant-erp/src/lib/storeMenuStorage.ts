/**
 * 店铺菜单/价目表（按租户 localStorage + Supabase tenant_store_intel 双写）。
 * 价目条目单独键保存，避免大图 data URL 撑爆 quota 导致条目丢失。
 */
import { supabase, supabaseConfigured } from './supabaseClient'
import { upsertMenuItemsCloud } from './tenantStoreIntelCloud'
import { tenantLocalKey, getActiveTenantStorageId } from './tenantLocalState'

const BASE_KEY = 'meoo_store_menu_v1'
const ITEMS_BASE_KEY = 'meoo_store_menu_items_v1'

export type StoreMenuItem = {
  name: string
  productCode?: string
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

type StoreMenuItemsPayload = {
  items: StoreMenuItem[]
  poiId?: string
  storeName?: string
  updatedAt: string
}

function storageKey(): string {
  return tenantLocalKey(BASE_KEY)
}

function itemsStorageKey(): string {
  return tenantLocalKey(ITEMS_BASE_KEY)
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

function parseItemsPayload(raw: string | null): StoreMenuItemsPayload | null {
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as StoreMenuItemsPayload
    if (!j || !Array.isArray(j.items)) return null
    return {
      items: j.items,
      poiId: j.poiId,
      storeName: j.storeName,
      updatedAt: j.updatedAt || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function findBestTenantMenuFromStorage(): StoreMenuRecord | null {
  const tid = getActiveTenantStorageId()
  let best: StoreMenuRecord | null = null
  let bestScore = 0
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (!k) continue
      if (tid && k === itemsStorageKey()) {
        const p = parseItemsPayload(window.localStorage.getItem(k))
        if (p && p.items.length > bestScore) {
          bestScore = p.items.length
          best = {
            ...createEmptyStoreMenuRecord(p.poiId, p.storeName),
            items: p.items,
            poiId: p.poiId,
            storeName: p.storeName,
            updatedAt: p.updatedAt,
          }
        }
      }
      if (k.startsWith(`${ITEMS_BASE_KEY}@`) || k === ITEMS_BASE_KEY) {
        const p = parseItemsPayload(window.localStorage.getItem(k))
        if (p && p.items.length > bestScore) {
          bestScore = p.items.length
          best = {
            ...createEmptyStoreMenuRecord(p.poiId, p.storeName),
            items: p.items,
            poiId: p.poiId,
            storeName: p.storeName,
            updatedAt: p.updatedAt,
          }
        }
      }
      if (k.startsWith(`${BASE_KEY}@`) || k === BASE_KEY) {
        const r = parseStoreMenuRaw(window.localStorage.getItem(k))
        const n = r?.items?.length ?? 0
        if (r && n > bestScore) {
          bestScore = n
          best = r
        }
      }
    }
  } catch {
    /* ignore */
  }
  return best
}

function mergeRecordWithItemsPayload(
  base: StoreMenuRecord | null,
  payload: StoreMenuItemsPayload | null,
): StoreMenuRecord | null {
  if (!payload?.items.length) return base
  if (!base) {
    return {
      ...createEmptyStoreMenuRecord(payload.poiId, payload.storeName),
      items: payload.items,
      updatedAt: payload.updatedAt,
    }
  }
  const baseTime = Date.parse(base.updatedAt || '') || 0
  const payTime = Date.parse(payload.updatedAt || '') || 0
  const usePayloadItems = base.items.length === 0 || payTime >= baseTime
  if (!usePayloadItems) return base
  return {
    ...base,
    items: payload.items,
    poiId: payload.poiId ?? base.poiId,
    storeName: payload.storeName ?? base.storeName,
    updatedAt: payload.updatedAt,
  }
}

export function loadStoreMenuRecord(): StoreMenuRecord | null {
  try {
    const itemsPayload = parseItemsPayload(window.localStorage.getItem(itemsStorageKey()))
    let keyed = parseStoreMenuRaw(window.localStorage.getItem(storageKey()))
    keyed = mergeRecordWithItemsPayload(keyed, itemsPayload)
    if (keyed?.items?.length) return keyed

    if (storageKey() !== BASE_KEY) {
      const legacyItems = parseItemsPayload(window.localStorage.getItem(ITEMS_BASE_KEY))
      let legacy = parseStoreMenuRaw(window.localStorage.getItem(BASE_KEY))
      legacy = mergeRecordWithItemsPayload(legacy, legacyItems)
      if (legacy?.items?.length) return legacy
      const any = findBestTenantMenuFromStorage()
      if (any?.items?.length) return any
    }
    return keyed
  } catch {
    return findBestTenantMenuFromStorage()
  }
}

function writeItemsPayload(rec: StoreMenuRecord): void {
  const payload: StoreMenuItemsPayload = {
    items: rec.items,
    poiId: rec.poiId,
    storeName: rec.storeName,
    updatedAt: rec.updatedAt,
  }
  window.localStorage.setItem(itemsStorageKey(), JSON.stringify(payload))
}

export type SaveStoreMenuResult = { ok: true } | { ok: false; message: string }

export function saveStoreMenuRecord(rec: StoreMenuRecord): SaveStoreMenuResult {
  const merged = { ...rec, updatedAt: new Date().toISOString() }
  try {
    writeItemsPayload(merged)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `价目保存失败：${msg}` }
  }
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(merged))
  } catch {
    /* 大图可能超限；条目已写入 items 键 */
  }
  if (supabaseConfigured && supabase) {
    void upsertMenuItemsCloud(supabase, merged.items, merged.storeName).then((r) => {
      if (!r.ok && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('meoo-store-menu-cloud-error', { detail: r.message }),
        )
      }
    })
  }
  return { ok: true }
}

export async function saveStoreMenuRecordAsync(rec: StoreMenuRecord): Promise<SaveStoreMenuResult> {
  const local = saveStoreMenuRecord(rec)
  if (!local.ok) return local
  if (!supabaseConfigured || !supabase) return { ok: true }
  const cloud = await upsertMenuItemsCloud(supabase, rec.items, rec.storeName)
  if (!cloud.ok) return { ok: false, message: cloud.message }
  return { ok: true }
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
      const code = it.productCode ? ` #${it.productCode}` : ''
      const cat = it.category ? `[${it.category}] ` : ''
      return `${cat}${it.name}${code}${p}${it.note ? `（${it.note}）` : ''}`
    })
  if (items.length > max) lines.push(`…共 ${items.length} 项，仅展示前 ${max} 项`)
  return lines.join('\n')
}
