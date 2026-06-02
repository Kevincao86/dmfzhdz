const mpGateway = require('./mpGateway.js')

const HALL_PATH = '/api/meoo-ops-mp-hall-registry'

function hallRegistryUrl() {
  return mpGateway.apiUrl(HALL_PATH)
}

/** 经 Vercel（cs.mofangdianai.com）服务端代拉 ECS，规避手机微信对根域 reset */
async function fetchHallRegistryViaCsGateway() {
  const data = await mpGateway.gatewayGet(HALL_PATH)
  if (!data || typeof data !== 'object') {
    throw new Error('registry_cs_empty')
  }
  if (data.ok === false) {
    throw new Error(String(data.detail || data.error || 'registry_cs_failed'))
  }
  if (!Array.isArray(data.mpRecruitmentOrders)) {
    throw new Error('registry_cs_invalid_shape')
  }
  return data
}

module.exports = {
  hallRegistryUrl,
  fetchHallRegistryViaCsGateway,
}
