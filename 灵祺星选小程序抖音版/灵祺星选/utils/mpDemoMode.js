const config = require('./config.js')

/** 体验版默认 false：仅展示运营台/数据库真实商单 */
function showDemoOrders() {
  return config.MP_SHOW_DEMO_ORDERS === true
}

module.exports = { showDemoOrders }
