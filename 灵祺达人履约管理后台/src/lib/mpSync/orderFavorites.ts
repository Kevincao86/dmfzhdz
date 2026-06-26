import { scopedStorageKey } from '../mpAccountLocalScope'

const KEY = 'meoo_hall_order_favorites_v1'

function readRaw(): string[] {
  try {
    const raw = localStorage.getItem(scopedStorageKey(KEY))
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
}

function writeRaw(ids: string[]) {
  localStorage.setItem(scopedStorageKey(KEY), JSON.stringify([...new Set(ids)].slice(0, 200)))
}

export function readOrderFavoriteIds(): Set<string> {
  return new Set(readRaw())
}

export function isOrderFavorited(id: string): boolean {
  return readOrderFavoriteIds().has(String(id || '').trim())
}

export function toggleOrderFavorite(id: string): boolean {
  const key = String(id || '').trim()
  if (!key) return false
  const set = readOrderFavoriteIds()
  const next = set.has(key)
  if (next) set.delete(key)
  else set.add(key)
  writeRaw([...set])
  import('../mpClientSyncHooks').then((m) => m.notifyLocalClientStateChanged()).catch(() => {})
  return !next
}

export function applyOrderFavoriteIdsFromSync(ids: string[] | undefined) {
  if (!Array.isArray(ids)) return
  writeRaw(ids.map(String))
}
