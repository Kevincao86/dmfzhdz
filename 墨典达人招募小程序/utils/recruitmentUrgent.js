/** 判断小程序招募单是否归入「急单大厅」（运营创建时显式选择加急单） */
function isUrgentMpOrder(mp) {
  return !!(mp && mp.urgent === true)
}

module.exports = { isUrgentMpOrder }
