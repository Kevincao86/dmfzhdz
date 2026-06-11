const { isEditTeamIceMpOrder, getEditGroupQrFromMp, getTalentGroupQrFromMp } = require('./iceOrderDetect.js')
const mpGroupQr = require('./mpGroupQr.js')

/** 认领确认后从注册表 mpGroupQrByOrderId 解析群码（剪辑师群 / 达人群分开） */
function resolveClaimGroupQr(reg, mpOrderId, mp) {
  const id = String(mpOrderId || '').trim()
  if (!id) return ''
  const map = reg && reg.mpGroupQrByOrderId && typeof reg.mpGroupQrByOrderId === 'object' ? reg.mpGroupQrByOrderId : null
  if (map && map[id]) return String(map[id]).trim()
  if (!mp) return ''
  if (isEditTeamIceMpOrder(mp)) return getEditGroupQrFromMp(mp)
  return getTalentGroupQrFromMp(mp) || mpGroupQr.groupQrFromMp(mp)
}

module.exports = { resolveClaimGroupQr }
