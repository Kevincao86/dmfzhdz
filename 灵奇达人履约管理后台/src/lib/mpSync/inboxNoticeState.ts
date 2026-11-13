import { scopedStorageKey } from '../mpAccountLocalScope'
import { getAccount } from '../mpSession'
import { notifyLocalClientStateChanged } from '../mpClientSyncHooks'

const HANDLED_KEY = 'meoo_inbox_selection_handled_v1'

function storageKey(): string {
  return scopedStorageKey(HANDLED_KEY, getAccount())
}

function readHandledMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey())
    const o = raw ? (JSON.parse(raw) as unknown) : {}
    return o && typeof o === 'object' ? (o as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeHandledMap(map: Record<string, string>, opts?: { skipSync?: boolean }) {
  const keys = Object.keys(map)
  const trimmed: Record<string, string> = {}
  for (let i = Math.max(0, keys.length - 300); i < keys.length; i++) {
    trimmed[keys[i]!] = map[keys[i]!]!
  }
  localStorage.setItem(storageKey(), JSON.stringify(trimmed))
  if (!opts?.skipSync) notifyLocalClientStateChanged()
}

function normalizeHandledMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k || '').trim()
    if (!key) continue
    out[key] = v === 'joined' ? 'joined' : 'confirmed'
  }
  return out
}

export function exportHandledMapForSync(): Record<string, string> {
  return readHandledMap()
}

export function applyHandledMapFromSync(remote: unknown) {
  const incoming = normalizeHandledMap(remote)
  if (!Object.keys(incoming).length) return
  writeHandledMap({ ...readHandledMap(), ...incoming }, { skipSync: true })
}

export function markSelectionHandled(noticeKey: string, action: 'joined' | 'confirmed' = 'confirmed') {
  const key = String(noticeKey || '').trim()
  if (!key) return
  const map = readHandledMap()
  map[key] = action === 'joined' ? 'joined' : 'confirmed'
  writeHandledMap(map)
}

export function isSelectionHandled(noticeKey: string): boolean {
  const key = String(noticeKey || '').trim()
  if (!key) return false
  return !!readHandledMap()[key]
}
