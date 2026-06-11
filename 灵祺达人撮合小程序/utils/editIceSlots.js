const { parseIceSlotTotalFromMp } = require('./mpRecruitCount.js')
const iceOrderStats = require('./iceOrderStats.js')

function countFreeEditPackSlots(mp) {
  const cap = parseIceSlotTotalFromMp(mp)
  return iceOrderStats.countRemainingIceSlots(mp, cap)
}

module.exports = { countFreeEditPackSlots }
