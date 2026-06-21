import type { RegistryMpPrUser } from './opsRegistryTypes.js'
import { matchRegionFilter } from './libraryRegionFilters.js'

export type PrLibraryFilterState = {
  provinces: string[]
  cities: string[]
}

export function matchPrLibraryFilters(u: RegistryMpPrUser, f: PrLibraryFilterState): boolean {
  return matchRegionFilter(u, f.provinces, f.cities)
}
