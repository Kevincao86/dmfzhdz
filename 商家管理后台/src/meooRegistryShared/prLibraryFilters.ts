import type { RegistryMpPrUser } from './opsRegistryTypes.js'
import { matchRegionFilter } from './libraryRegionFilters.js'

export const PR_GENDER_OPTS = ['全部', '男', '女'] as const

export type PrLibraryFilterState = {
  gender: string
  provinces: string[]
  cities: string[]
}

export function matchPrLibraryFilters(u: RegistryMpPrUser, f: PrLibraryFilterState): boolean {
  if (!matchRegionFilter(u, f.provinces, f.cities)) return false
  const gender = String(u.gender || '').trim()
  if (f.gender !== '全部') {
    if (!gender || gender === '不限') return false
    if (gender !== f.gender) return false
  }
  return true
}
