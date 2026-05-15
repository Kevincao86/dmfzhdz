const { merchantRequest } = require('./merchantApi.js')

/** @returns {Promise<any>} 完整注册表 JSON（含 recruitmentOrders） */
async function fetchRegistry() {
  return merchantRequest('GET', '/api/ops-sync/registry')
}

/**
 * 与 Web `appendRecruitmentOrderToOps` 一致：追加一条招募订单到共享注册表。
 * @param {Record<string, unknown>} order RegistryRecruitmentOrder 形状
 */
async function appendRecruitmentOrder(order) {
  return merchantRequest('POST', '/api/ops-sync/recruitment-orders/append', { order })
}

module.exports = { fetchRegistry, appendRecruitmentOrder }
