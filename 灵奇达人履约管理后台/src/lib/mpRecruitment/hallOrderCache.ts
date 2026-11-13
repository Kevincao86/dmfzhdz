/** 星选大厅：老商单用本地缓存先展示，新商单或内容有变再拉网络。 */

const HALL_KEY = 'xx-hall-orders-v1'
const DETAIL_KEY = 'xx-order-detail-v1'
const DETAIL_MAX = 24

export type CachedOrder = Record<string, unknown>

type DetailEntry = {
  id: string
  revision: string
  mp: CachedOrder
  savedAt: number
}

export function orderRevision(mp: CachedOrder | null | undefined): string {
  if (!mp) return ''
  return [
    String(mp.updatedAt || mp.createdAt || ''),
    String(mp.status || ''),
    String(mp.applicantCount ?? ''),
  ].join('|')
}

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 配额满时继续用内存路径，不打断列表 */
  }
}

export function readHallOrders(): CachedOrder[] {
  const list = readJson<CachedOrder[]>(HALL_KEY)
  if (!Array.isArray(list)) return []
  return list.filter((row) => row && String(row.id || '').trim())
}

export function writeHallOrders(orders: CachedOrder[]): void {
  const list = orders.filter((row) => row && String(row.id || '').trim())
  if (!list.length) return
  writeJson(HALL_KEY, list)
}

export function hallRevision(id: string): string {
  const hit = readHallOrders().find((row) => String(row.id || '') === id)
  return orderRevision(hit)
}

export function readOrderDetail(id: string): DetailEntry | null {
  const map = readJson<Record<string, DetailEntry>>(DETAIL_KEY)
  const hit = map?.[id]
  if (!hit || !hit.mp || String(hit.mp.id || '') !== id) return null
  return hit
}

export function writeOrderDetail(mp: CachedOrder): void {
  const id = String(mp.id || '').trim()
  if (!id) return
  const map = readJson<Record<string, DetailEntry>>(DETAIL_KEY) || {}
  map[id] = { id, revision: orderRevision(mp), mp, savedAt: Date.now() }
  const entries = Object.values(map).sort((a, b) => b.savedAt - a.savedAt)
  const next: Record<string, DetailEntry> = {}
  for (const row of entries.slice(0, DETAIL_MAX)) next[row.id] = row
  writeJson(DETAIL_KEY, next)
}

/** 大厅列表上的版本和详情缓存一致，说明还是老商单，不必再拉。 */
export function detailCacheIsCurrent(id: string): DetailEntry | null {
  const cached = readOrderDetail(id)
  if (!cached) return null
  const listed = hallRevision(id)
  if (listed && listed !== cached.revision) return null
  return cached
}
