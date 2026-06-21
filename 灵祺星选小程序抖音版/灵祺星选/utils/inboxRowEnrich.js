const mpGroupQr = require('./mpGroupQr.js')
const inboxNoticeState = require('./inboxNoticeState.js')

function groupQrForMpOrder(reg, mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id || !reg) return ''
  const map = reg.mpGroupQrByOrderId && typeof reg.mpGroupQrByOrderId === 'object' ? reg.mpGroupQrByOrderId : null
  if (map && map[id]) return String(map[id]).trim()
  const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === id)
  return mp ? mpGroupQr.groupQrFromMp(mp) : ''
}

function attachGroupQr(reg, row) {
  if (!row || !inboxNoticeState.isSelectionNotice(row)) return row
  let imageUrl = String(row.imageUrl || '').trim()
  if (!imageUrl && row.mpOrderId) imageUrl = groupQrForMpOrder(reg, row.mpOrderId)
  return imageUrl ? { ...row, imageUrl } : row
}

function enrichAndSort(reg, rows) {
  const list = inboxNoticeState
    .sortRows((rows || []).map((r) => inboxNoticeState.enrichRow(attachGroupQr(reg, r))))
  return list
}

module.exports = {
  groupQrForMpOrder,
  attachGroupQr,
  enrichAndSort,
}
