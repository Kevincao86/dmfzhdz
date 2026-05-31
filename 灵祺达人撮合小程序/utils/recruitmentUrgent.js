/** 判断小程序招募单是否归入「急单大厅」（运营创建时显式选择加急单） */
function isUrgentMpOrder(mp) {
  return !!(mp && mp.urgent === true)
}

/** 云剪任务大厅（有素材仅发布） */
function isIceMpOrder(mp) {
  return !!(mp && (mp.hall === 'ice' || mp.orderKind === 'recruitment_ice'))
}

module.exports = { isUrgentMpOrder, isIceMpOrder }
