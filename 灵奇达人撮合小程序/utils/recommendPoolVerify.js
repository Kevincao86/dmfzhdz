const poolUtil = require('./recommendAllTalentsPool.js')
const prBoard = require('./prRecommendBoard.js')

function expectedPoolSize(reg, board) {
  if (board === 'talent') return poolUtil.expectTalentLibraryPoolSize(reg)
  if (board === 'shoot') {
    return Array.isArray(reg.shootTeamLibraryEntries) ? reg.shootTeamLibraryEntries.length : 0
  }
  return Array.isArray(reg.editTeamLibraryEntries) ? reg.editTeamLibraryEntries.length : 0
}

function verifyRecommendPoolParity(reg, board, poolSize) {
  const meta = reg && reg._recommendPoolMeta
  const expected = expectedPoolSize(reg, board)
  if (meta && typeof meta === 'object') {
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

function logRecommendPoolParity(reg, board) {
  const pool = prBoard.buildBoardPool(reg, board)
  const err = verifyRecommendPoolParity(reg, board, pool.length)
  if (err) console.warn('[recommend-pool]', err)
}

module.exports = {
  verifyRecommendPoolParity,
  logRecommendPoolParity,
}
