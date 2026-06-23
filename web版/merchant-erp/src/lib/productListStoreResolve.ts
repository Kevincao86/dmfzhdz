/** 商品列表「门店」列展示与按 poi_id 筛选 */

export type ProductListStoreRef = { id: string; name: string }

export function formatProductStoreLabel(names: string[], poiCount = 0, fallback = '—'): string {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (uniq.length === 1) return uniq[0]!
  if (uniq.length > 1) {
    if (uniq.length <= 3) return uniq.join('、')
    return `${uniq.slice(0, 2).join('、')} 等 ${uniq.length} 家门店`
  }
  if (poiCount > 0) return `${poiCount} 家门店`
  const fb = fallback.trim()
  return fb || '—'
}

export function buildPoiNameMap(stores: ProductListStoreRef[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const s of stores) {
    const id = s.id.trim()
    const name = s.name.trim()
    if (id && name) map.set(id, name)
  }
  return map
}

export function resolveProductStoreLabel(
  row: { store: string; poiIds?: string[] },
  poiNameById: Map<string, string>,
): string {
  if (row.poiIds?.length) {
    const names = row.poiIds
      .map((id) => poiNameById.get(id.trim()))
      .filter((n): n is string => Boolean(n?.trim()))
    if (names.length) return formatProductStoreLabel(names, row.poiIds.length, row.store)
  }
  return row.store.trim() || '—'
}

export function productMatchesStoreFilter(
  row: { store: string; poiIds?: string[] },
  filterPoiId: string,
  poiNameById: Map<string, string>,
): boolean {
  const pid = filterPoiId.trim()
  if (!pid) return true
  if (row.poiIds?.some((id) => id.trim() === pid)) return true
  const name = poiNameById.get(pid)
  if (name && row.store.includes(name)) return true
  return false
}
