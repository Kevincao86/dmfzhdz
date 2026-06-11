import { countRemainingIceSlots } from '../mpRecruitment/iceOrderStats'
import { parseIceSlotTotalFromMp } from '../mpRecruitment/listFilters'

export function countFreeEditPackSlots(mp: Record<string, unknown>): number {
  const cap = parseIceSlotTotalFromMp(mp)
  return countRemainingIceSlots(mp, cap)
}
