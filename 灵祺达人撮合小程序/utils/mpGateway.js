const config = require('./config.js')
const merchantApi = require('./merchantApi.js')

function gatewayBase() {
  const b = String(
    config.MP_GATEWAY_BASE_URL || config.MP_REGISTRY_GATEWAY_BASE_URL || 'https://cs.mofangdianai.com',
  )
    .trim()
    .replace(/\/$/, '')
  return b
}

function hasGateway() {
  return /^https?:\/\//i.test(gatewayBase())
}

function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${gatewayBase()}${p}`
}

function gatewayGet(path) {
  return merchantApi.merchantGetUrl(apiUrl(path))
}

function gatewayPost(path, body) {
  return merchantApi.merchantPostUrl(apiUrl(path), body || {})
}

module.exports = {
  gatewayBase,
  hasGateway,
  apiUrl,
  gatewayGet,
  gatewayPost,
}
