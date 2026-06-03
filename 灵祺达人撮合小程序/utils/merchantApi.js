/**
 * 兼容旧页面 require；实现已迁至 ecsApi.js（仅 ECS erp-api）。
 */
const ecs = require('./ecsApi.js')

function baseUrl() {
  return ecs.erpBase()
}

function hasMerchantApi() {
  return ecs.hasEcsApi()
}

function erpApiBaseList() {
  const b = baseUrl()
  return b ? [b] : []
}

function resolveMerchantApiUrl(path) {
  return ecs.resolveUrl(path)
}

function merchantRequest(method, path, data, attemptOrOpts = 0) {
  let extraHeader = {}
  if (attemptOrOpts && typeof attemptOrOpts === 'object') {
    extraHeader = attemptOrOpts.header || {}
  }
  return ecs.ecsRequest(method, path, data, { header: extraHeader })
}

function merchantGetUrl(url) {
  const u = String(url || '').trim()
  if (!u) return Promise.reject(new Error('缺少请求 URL'))
  return ecs.fetchJsonWithRetry(u, 'GET', undefined, {})
}

function merchantPostUrl(url, data, extraHeader = {}) {
  const u = String(url || '').trim()
  if (!u) return Promise.reject(new Error('缺少请求 URL'))
  return ecs.fetchJsonWithRetry(u, 'POST', data || {}, extraHeader)
}

module.exports = {
  baseUrl,
  erpApiBaseList,
  hasMerchantApi,
  merchantRequest,
  merchantGetUrl,
  merchantPostUrl,
  resolveMerchantApiUrl,
  isRealDevice: ecs.isRealDevice,
  isTransientNetError: ecs.isTransientNetError,
  MP_BUILD_ID: ecs.MP_BUILD_ID,
}
