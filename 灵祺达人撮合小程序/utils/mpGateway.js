/**
 * 已废弃 Vercel/cs 网关；统一走 ECS erp-api（与 merchantApi 相同）。
 */
const { merchantRequest, resolveMerchantApiUrl } = require('./merchantApi.js')

function hasGateway() {
  return false
}

function gatewayBase() {
  return ''
}

function apiUrl(path) {
  return resolveMerchantApiUrl(path)
}

function gatewayGet(path) {
  return merchantRequest('GET', path)
}

function gatewayPost(path, body, opts = {}) {
  return merchantRequest('POST', path, body, { header: opts.header || {} })
}

module.exports = {
  gatewayBase,
  hasGateway,
  apiUrl,
  gatewayGet,
  gatewayPost,
}
