/** 判断小程序招募单是否归入「急单大厅」（运营创建时显式选择加急单） */
function isUrgentMpOrder(mp) {
  return !!(mp && mp.urgent === true)
}

/** 云剪任务（与 iceOrderDetect / Web orderCard 一致） */
const { isIceMpOrder } = require('./iceOrderDetect.js')

module.exports = { isUrgentMpOrder, isIceMpOrder }
