/** 达人库 / PR 库共用的省、市 chip 筛选 */

export function buildProvinceOpts(items: Array<{ province?: string; city?: string }>): string[] {
  const set = new Set<string>()
  for (const item of items) {
    const p = String(item.province || '').trim()
    if (p) set.add(p)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function buildCityOpts(
  items: Array<{ province?: string; city?: string }>,
  selectedProvinces: string[],
): string[] {
  const set = new Set<string>()
  for (const item of items) {
    const province = String(item.province || '').trim()
    if (selectedProvinces.length && !selectedProvinces.includes(province)) continue
    const c = String(item.city || '').trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function matchRegionFilter(
  item: { province?: string; city?: string },
  provinces: string[],
  cities: string[],
): boolean {
  const province = String(item.province || '').trim()
  const city = String(item.city || '').trim()
  if (provinces.length && !provinces.includes(province)) return false
  if (cities.length && !cities.includes(city)) return false
  return true
}

export function toggleChip(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}
