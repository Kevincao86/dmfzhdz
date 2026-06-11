/** 推荐大厅：仅招募中/收集中 + 按发单一级对象与身份严格匹配（与星选 Web 一致） */
function primaryRecruitTargetForIdentity(identity) {
  if (identity === 'shoot') return 'shoot'
  if (identity === 'edit') return 'edit'
  return 'talent'
}

function orderMatchesRecommendHallIdentity(row, identity) {
  if (!row) return false
  if (identity === 'pr') return false
  const target = row.recruitTarget || 'talent'
  return target === primaryRecruitTargetForIdentity(identity)
}

function isRecommendHallRecruitingStatus(row) {
  if (!row) return false
  const label = String(row.statusLabel || '').trim()
  if (label === '招募中' || label === '收集中') return true
  const s = String(row.status || '').trim()
  return s === 'open' || s === 'collecting'
}

function filterRecommendHallOrders(rows, identity) {
  return (rows || []).filter(
    (r) => isRecommendHallRecruitingStatus(r) && orderMatchesRecommendHallIdentity(r, identity),
  )
}

module.exports = {
  primaryRecruitTargetForIdentity,
  orderMatchesRecommendHallIdentity,
  isRecommendHallRecruitingStatus,
  filterRecommendHallOrders,
}
