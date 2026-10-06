import type { RegistryMpPrUser } from './opsRegistryTypes.js'
import { matchRegionFilter } from './libraryRegionFilters.js'

export type PrLibraryFilterState = {
  provinces: string[]
  cities: string[]
  createdFrom?: string
  createdTo?: string
}

function matchCreatedRange(raw: string | undefined, from?: string, to?: string): boolean {
  const start = String(from || '').trim()
  const end = String(to || '').trim()
  if (!start && !end) return true
  const ms = Date.parse(String(raw || '').trim())
  if (!Number.isFinite(ms)) return false
  if (start) {
    const fromMs = Date.parse(`${start}T00:00:00`)
    if (Number.isFinite(fromMs) && ms < fromMs) return false
  }
  if (end) {
    const toMs = Date.parse(`${end}T23:59:59.999`)
    if (Number.isFinite(toMs) && ms > toMs) return false
  }
  return true
}

export function matchPrLibraryFilters(u: RegistryMpPrUser, f: PrLibraryFilterState): boolean {
  if (!matchRegionFilter(u, f.provinces, f.cities)) return false
  const created = String(u.registeredAt || '').trim()
  return matchCreatedRange(created, f.createdFrom, f.createdTo)
}
