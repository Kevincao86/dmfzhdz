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

function getIceVerifyMode(mp) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const raw = String(meta.iceVerifyMode || meta.iceAuditMode || 'ai').trim().toLowerCase()
  return raw === 'pr' ? 'pr' : 'ai'
}

/** 剪辑师云剪（edit_ice）：认领后上传成片，非达人直派下载 */
function isEditTeamIceMpOrder(mp) {
  if (!isIceMpOrder(mp)) return false
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const target = String(meta.recruitTarget || mp.recruitTarget || '').trim()
  const mode = String(meta.recruitMode || '').trim()
  return target === 'edit' || mode === 'edit_ice'
}

function getEditGroupQrFromMp(mp) {
  if (!mp) return ''
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return String(mp.editGroupQrImage || meta.editGroupQrImage || '').trim()
}

/** 达人云剪直发群二维码（与剪辑师群分开） */
function getTalentGroupQrFromMp(mp) {
  if (!mp) return ''
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return String(mp.groupQrImage || meta.groupQrImage || '').trim()
}

module.exports = {
  isIceMpOrder,
  getIceVerifyMode,
  isEditTeamIceMpOrder,
  getEditGroupQrFromMp,
  getTalentGroupQrFromMp,
}
