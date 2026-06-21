const { isIceMpOrder } = require('./iceOrderDetect.js')
const { modeById } = require('./publishFormOptions.js')
const { recruitModeIdFromMp } = require('./mpOrderPublishRestore.js')

const TALENT_ORDER_TYPE_FILTERS = [
  { id: 'all', label: '全部类型' },
  { id: 'visit', label: '探店' },
  { id: 'brand', label: '品宣' },
  { id: 'live', label: '直播' },
  { id: 'ice', label: '云剪' },
  { id: 'urgent', label: '急单' },
]

function resolveOrderTypeFromMp(mp, localApp) {
  const mpOrderId = String((mp && mp.id) || (localApp && localApp.mpOrderId) || '')
  if (!mp) {
    if (/^MP-ICE-/i.test(mpOrderId)) return { id: 'ice', label: '云剪' }
    return { id: 'visit', label: '探店' }
  }
  const modeId = recruitModeIdFromMp(mp)
  if (modeId === 'ice' || modeId === 'edit_ice' || isIceMpOrder(mp)) {
    return { id: 'ice', label: '云剪' }
  }
  if (modeId === 'live') return { id: 'live', label: '直播' }
  if (modeId === 'brand') return { id: 'brand', label: '品宣' }
  if (modeId === 'visit') return { id: 'visit', label: '探店' }
  const mode = modeById(modeId)
  if (mode && mode.category) {
    if (mode.category === '直播') return { id: 'live', label: '直播' }
    if (mode.category === '品宣') return { id: 'brand', label: '品宣' }
    if (mode.category === '云剪') return { id: 'ice', label: '云剪' }
    if (mode.category === '探店') return { id: 'visit', label: '探店' }
  }
  const cat = String(mp.category || '')
  if (cat.includes('直播')) return { id: 'live', label: '直播' }
  if (cat.includes('品宣')) return { id: 'brand', label: '品宣' }
  if (cat.includes('云剪')) return { id: 'ice', label: '云剪' }
  return { id: 'visit', label: mode?.label || '探店' }
}

function matchOrderTypeFilter(row, filterId) {
  if (!filterId || filterId === 'all') return true
  if (filterId === 'urgent') return !!row.isUrgent
  return String(row.orderTypeId || '') === filterId
}

module.exports = {
  TALENT_ORDER_TYPE_FILTERS,
  resolveOrderTypeFromMp,
  matchOrderTypeFilter,
}
