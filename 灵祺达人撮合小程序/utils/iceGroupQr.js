const mpGroupQr = require('./mpGroupQr.js')
const { isIceMpOrder } = require('./iceOrderDetect.js')

function mpMeta(mp) {
  return mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
}

function isEditTeamIceMp(mp) {
  if (!isIceMpOrder(mp)) return false
  const meta = mpMeta(mp)
  const target = String(meta.recruitTarget || mp.recruitTarget || '').trim()
  const mode = String(meta.recruitMode || '').trim()
  return target === 'edit' || mode === 'edit_ice'
}

function getEditGroupQrFromMp(mp) {
  if (!mp) return ''
  const meta = mpMeta(mp)
  return String(mp.editGroupQrImage || meta.editGroupQrImage || '').trim()
}

function getTalentGroupQrFromMp(mp) {
  if (!mp) return ''
  const meta = mpMeta(mp)
  return String(mp.groupQrImage || meta.groupQrImage || '').trim()
}

/** 认领成功后展示：剪辑师群 / 达人群分开 */
function resolveClaimGroupQr(mp, reg, mpOrderId, identity) {
  const id = String(mpOrderId || '').trim()
  if (!id || !mp) return ''
  if (reg && reg.mpGroupQrByOrderId && reg.mpGroupQrByOrderId[id]) {
    return String(reg.mpGroupQrByOrderId[id]).trim()
  }
  const isEditOrder = isEditTeamIceMp(mp)
  if (identity === 'edit' && isEditOrder) return getEditGroupQrFromMp(mp)
  if (identity === 'talent' && isEditOrder) return ''
  if (isEditOrder) return getEditGroupQrFromMp(mp)
  return getTalentGroupQrFromMp(mp) || mpGroupQr.groupQrFromMp(mp)
}

module.exports = {
  isEditTeamIceMp,
  getEditGroupQrFromMp,
  getTalentGroupQrFromMp,
  resolveClaimGroupQr,
}
