import type { MpRegistry } from './types'
import { expectTalentLibraryPoolSize } from './recommendAllTalentsPool'
import { buildBoardPool, type PrBoardId } from './prRecommendBoard'

export function verifyRecommendPoolParity(reg: MpRegistry, board: PrBoardId, poolSize: number): string | null {
  const meta = reg._recommendPoolMeta as Record<string, number> | undefined
  let expected = 0
  if (board === 'talent') expected = expectTalentLibraryPoolSize(reg)
  else if (board === 'shoot') {
    expected = Array.isArray(reg.shootTeamLibraryEntries) ? reg.shootTeamLibraryEntries.length : 0
  } else {
    expected = Array.isArray(reg.editTeamLibraryEntries) ? reg.editTeamLibraryEntries.length : 0
  }
  if (meta) {
    const metaKey =
      board === 'talent'
        ? 'talentLibraryCount'
        : board === 'shoot'
          ? 'shootTeamLibraryCount'
          : 'editTeamLibraryCount'
    const metaCount = Number(meta[metaKey] || 0)
    if (metaCount > 0 && metaCount !== expected) {
      return `recommend_meta_mismatch:${board}:${metaCount}!=${expected}`
    }
  }
  if (expected > 0 && poolSize !== expected) {
    return `recommend_pool_mismatch:${board}:${poolSize}!=${expected}`
  }
  return null
}

export function logRecommendPoolParity(reg: MpRegistry, board: PrBoardId): void {
  const pool = buildBoardPool(reg, board)
  const err = verifyRecommendPoolParity(reg, board, pool.length)
  if (err) console.warn('[recommend-pool]', err)
}
