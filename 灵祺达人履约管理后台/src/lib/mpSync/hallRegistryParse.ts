/** 统一解析大厅接口 JSON（轻量 { mpRecruitmentOrders } 或历史全量注册表） */
export function normalizeHallRegistryPayload(data: Record<string, unknown>): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    throw new Error('invalid_hall_data')
  }
  if (data.ok === false) {
    throw new Error(String(data.detail || data.error || 'hall_registry_failed'))
  }
  let mp = data.mpRecruitmentOrders
  const nested =
    data.registry && typeof data.registry === 'object'
      ? (data.registry as Record<string, unknown>)
      : null
  if (!Array.isArray(mp) && nested) {
    mp = nested.mpRecruitmentOrders
  }
  let inbox = data.mpTalentInbox
  if (!Array.isArray(inbox) && nested) {
    inbox = nested.mpTalentInbox
  }
  let mpGroupQrByOrderId = data.mpGroupQrByOrderId
  if ((!mpGroupQrByOrderId || typeof mpGroupQrByOrderId !== 'object') && nested) {
    mpGroupQrByOrderId = nested.mpGroupQrByOrderId
  }
  return {
    ok: true,
    mpRecruitmentOrders: Array.isArray(mp) ? mp : [],
    recruitmentOrders: Array.isArray(data.recruitmentOrders) ? data.recruitmentOrders : [],
    mpTalentMembers: Array.isArray(data.mpTalentMembers) ? data.mpTalentMembers : [],
    mpTalentInbox: Array.isArray(inbox) ? inbox : [],
    mpGroupQrByOrderId:
      mpGroupQrByOrderId && typeof mpGroupQrByOrderId === 'object' ? mpGroupQrByOrderId : {},
    talentLibraryEntries: Array.isArray(data.talentLibraryEntries) ? data.talentLibraryEntries : [],
    shootTeamLibraryEntries: Array.isArray(data.shootTeamLibraryEntries)
      ? data.shootTeamLibraryEntries
      : [],
    editTeamLibraryEntries: Array.isArray(data.editTeamLibraryEntries)
      ? data.editTeamLibraryEntries
      : [],
    mpPrUsers: Array.isArray(data.mpPrUsers) ? data.mpPrUsers : [],
  }
}
