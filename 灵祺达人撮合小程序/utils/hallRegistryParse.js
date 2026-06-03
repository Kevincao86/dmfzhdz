/** 统一解析大厅接口 JSON（轻量 { mpRecruitmentOrders } 或历史全量注册表） */
function normalizeHallPayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('invalid_hall_data')
  }
  if (data.ok === false) {
    throw new Error(String(data.detail || data.error || 'hall_registry_failed'))
  }
  let mp = data.mpRecruitmentOrders
  if (!Array.isArray(mp) && data.registry && typeof data.registry === 'object') {
    mp = data.registry.mpRecruitmentOrders
  }
  if (!Array.isArray(mp)) {
    throw new Error('missing_mpRecruitmentOrders')
  }
  return {
    mpRecruitmentOrders: mp,
    recruitmentOrders: [],
    mpTalentMembers: [],
    mpPrUsers: [],
  }
}

module.exports = { normalizeHallPayload }
