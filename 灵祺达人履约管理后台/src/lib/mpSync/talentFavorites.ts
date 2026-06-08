import { scopedStorageKey } from '../mpAccountLocalScope'
import { getAccount } from '../mpSession'
import { readPrProfile } from './userProfile'
import { prParticipantKey } from './participant'

const KEY_PREFIX = 'meoo_pr_talent_favorites_v1_'

function storageKey(): string {
  const pr = readPrProfile()
  if (!pr) return ''
  return scopedStorageKey(`${KEY_PREFIX}${prParticipantKey(pr)}`)
}

export function readFavoriteIds(): string[] {
  const key = storageKey()
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export function writeFavoriteIds(ids: string[]) {
  const key = storageKey()
  if (!key) return
  localStorage.setItem(key, JSON.stringify([...new Set(ids.map(String))].slice(0, 500)))
  import('../mpClientSyncHooks').then((m) => m.notifyLocalClientStateChanged()).catch(() => {})
}

export function isFavorite(talentId: string): boolean {
  return readFavoriteIds().includes(String(talentId))
}

export function toggleFavorite(talentId: string): boolean {
  const id = String(talentId || '').trim()
  if (!id || id === 'mock-preview') return false
  const set = new Set(readFavoriteIds())
  if (set.has(id)) set.delete(id)
  else set.add(id)
  writeFavoriteIds([...set])
  return set.has(id)
}

export function applyFavoriteIdsFromSync(ids: string[] | undefined) {
  if (!Array.isArray(ids)) return
  const key = storageKey()
  if (!key) return
  localStorage.setItem(key, JSON.stringify([...new Set(ids.map(String))].slice(0, 500)))
}
