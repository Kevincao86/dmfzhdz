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

async function setTalentPoolCandidates(candidates) {
  const paths = ['/api/meoo-ops-talent-pool-set', '/api/ops-sync/talent-pool/set']
  let lastErr = ''
  for (const path of paths) {
    try {
      return await merchantRequest('POST', path, { candidates })
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr || 'talent-pool/set 失败')
}

async function setRecruitmentScheduleRows(rows) {
  const paths = ['/api/meoo-ops-recruitment-schedule-set', '/api/ops-sync/recruitment-schedule/set']
  let lastErr = ''
  for (const path of paths) {
    try {
      return await merchantRequest('POST', path, { rows })
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr || 'schedule/set 失败')
}

async function setRecruitmentVideoSubmissions(videos) {
  return merchantRequest('POST', '/api/ops-sync/recruitment-videos/set', { videos })
}

module.exports = {
  fetchRegistry,
  appendRecruitmentOrder,
  setTalentPoolCandidates,
  setRecruitmentScheduleRows,
  setRecruitmentVideoSubmissions,
}
