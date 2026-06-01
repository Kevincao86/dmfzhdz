/**
 * 连锁门店：从店名或来客「门店品牌」归并为品牌维度（如 魔楽斑马生活科技馆（天一店）→ 魔楽斑马生活科技馆）
 */

export type BrandGroupStore = {
  id: string
  name: string
  address?: string
  city?: string
  brandName?: string
}

export type StoreBrandGroup = {
  brandKey: string
  brandDisplayName: string
  stores: BrandGroupStore[]
}

function brandKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

/** 从门店标题去掉分店后缀，得到品牌主名 */
export function inferBrandNameFromStoreTitle(title: string): string | null {
  const t = title.trim()
  if (!t) return null
  const paren = t.match(/^(.+?)[（(]([^)）]{1,24}店)[)）]\s*$/)
  if (paren?.[1]?.trim()) return paren[1].trim()
  const dot = t.match(/^(.+?)[·•—－-]([^·•—－-]{1,24}店)\s*$/)
  if (dot?.[1]?.trim()) return dot[1].trim()
  const space = t.match(/^(.+?)\s+([^\s]{1,12}店)\s*$/)
  if (space?.[1]?.trim() && space[1].trim().length >= 2) return space[1].trim()
  return null
}

/** 展示用品牌名：优先来客 brandName，否则从店名推断 */
export function resolveStoreBrandLabel(store: { name: string; brandName?: string }): string {
  const fromApi = store.brandName?.trim()
  if (fromApi) return fromApi
  return inferBrandNameFromStoreTitle(store.name) ?? store.name.trim()
}

export function groupStoresByBrand(stores: BrandGroupStore[]): StoreBrandGroup[] {
  const map = new Map<string, StoreBrandGroup>()
  for (const s of stores) {
    const label = resolveStoreBrandLabel(s)
    const key = brandKey(label)
    const g = map.get(key)
    if (g) g.stores.push(s)
    else map.set(key, { brandKey: key, brandDisplayName: label, stores: [s] })
  }
  return [...map.values()].sort((a, b) => {
    if (b.stores.length !== a.stores.length) return b.stores.length - a.stores.length
    return a.brandDisplayName.localeCompare(b.brandDisplayName, 'zh-Hans-CN')
  })
}

/** 连锁：同品牌下 ≥2 家门店 */
export function isChainBrandGroup(group: StoreBrandGroup): boolean {
  return group.stores.length >= 2
}

export function listChainBrandOptions(
  stores: BrandGroupStore[],
): Array<{ brandKey: string; brandName: string; storeCount: number }> {
  return groupStoresByBrand(stores)
    .filter(isChainBrandGroup)
    .map((g) => ({
      brandKey: g.brandKey,
      brandName: g.brandDisplayName,
      storeCount: g.stores.length,
    }))
}

export function pickBrandAnchorAddress(group: StoreBrandGroup): {
  address: string
  city?: string
  anchorStoreName?: string
} {
  for (const s of group.stores) {
    const addr = s.address?.trim()
    if (addr) return { address: addr, city: s.city?.trim() || undefined, anchorStoreName: s.name }
  }
  return { address: '', city: undefined }
}
