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
    mp = []
  }
  return {
    mpRecruitmentOrders: mp,
    recruitmentOrders: Array.isArray(data.recruitmentOrders) ? data.recruitmentOrders : [],
    mpTalentMembers: Array.isArray(data.mpTalentMembers) ? data.mpTalentMembers : [],
    talentLibraryEntries: Array.isArray(data.talentLibraryEntries) ? data.talentLibraryEntries : [],
    shootTeamLibraryEntries: Array.isArray(data.shootTeamLibraryEntries) ? data.shootTeamLibraryEntries : [],
    editTeamLibraryEntries: Array.isArray(data.editTeamLibraryEntries) ? data.editTeamLibraryEntries : [],
    mpPrUsers: Array.isArray(data.mpPrUsers) ? data.mpPrUsers : [],
  }
}

module.exports = { normalizeHallPayload }
