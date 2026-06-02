const config = require('./config.js')
const merchantApi = require('./merchantApi.js')

const HALL_PATH = '/api/meoo-ops-mp-hall-registry'

function gatewayBase() {
  return String(config.MP_REGISTRY_GATEWAY_BASE_URL || 'https://cs.mofangdianai.com')
    .trim()
    .replace(/\/$/, '')
}

function hallRegistryUrl() {
  return `${gatewayBase()}${HALL_PATH}`
}

/** 经 Vercel（cs.mofangdianai.com）服务端代拉 ECS，规避手机微信对根域 reset */
async function fetchHallRegistryViaCsGateway() {
  const url = hallRegistryUrl()
  const data = await merchantApi.merchantGetUrl(url)
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
