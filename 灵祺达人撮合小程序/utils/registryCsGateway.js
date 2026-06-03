const { merchantRequest } = require('./merchantApi.js')

const HALL_PATH = '/api/meoo-ops-mp-hall-registry'

function hallRegistryUrl() {
  const { resolveMerchantApiUrl } = require('./merchantApi.js')
  return resolveMerchantApiUrl(HALL_PATH)
}

/** 与 erp-api 相同（保留模块名兼容 opsRegistryTalentMp） */
async function fetchHallRegistryViaCsGateway() {
  const data = await merchantRequest('GET', HALL_PATH)
  if (!data || typeof data !== 'object') {
    throw new Error('registry_ecs_empty')
  }
  if (data.ok === false) {
    throw new Error(String(data.detail || data.error || 'registry_ecs_failed'))
  }
  if (!Array.isArray(data.mpRecruitmentOrders)) {
    throw new Error('registry_ecs_invalid_shape')
  }
  return data
}

module.exports = {
  hallRegistryUrl,
  fetchHallRegistryViaCsGateway,
}
