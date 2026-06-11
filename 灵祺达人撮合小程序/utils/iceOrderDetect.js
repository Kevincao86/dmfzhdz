/** 云剪单识别（与 ECS mpRecruitmentIceCore 保持一致） */
function isIceMpOrder(mp) {
  if (!mp) return false
  if (mp.hall === 'ice' || mp.orderKind === 'recruitment_ice' || mp.orderKind === 'ice') return true
  const id = String(mp.id || '').trim()
  if (/^MP-ICE-/i.test(id)) return true
  if (String(mp.category || '').trim() === '云剪') return true
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const mode = String(meta.recruitMode || '').trim()
  if (mode === 'ice' || mode === 'edit_ice') return true
  return false
}

function isEditTeamIceMp(mp) {
  if (!isIceMpOrder(mp)) return false
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const target = String(meta.recruitTarget || mp.recruitTarget || '').trim()
  const mode = String(meta.recruitMode || '').trim()
  return target === 'edit' || mode === 'edit_ice'
}

module.exports = { isIceMpOrder, isEditTeamIceMp }
