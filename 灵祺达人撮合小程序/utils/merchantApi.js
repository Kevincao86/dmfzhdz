/**
 * 兼容层：页面继续 require merchantApi，实现统一走 mpEcsClient
 */
const mp = require('./mpEcsClient.js')

function baseUrl() {
  return mp.erpBase()
}

function hasMerchantApi() {
  return !!mp.erpBase()
}

function erpApiBaseList() {
  const b = baseUrl()
  return b ? [b] : []
}

function resolveMerchantApiUrl(path) {
  return mp.toUrl(path)
}

function merchantRequest(method, path, data, attemptOrOpts = 0) {
  const headers =
    attemptOrOpts && typeof attemptOrOpts === 'object' ? attemptOrOpts.header || {} : {}
  return mp.call({ method, path, body: data, headers })
}

function merchantGetUrl(url) {
  return mp.getJson(String(url || '').trim())
}

function merchantPostUrl(url, data, extraHeader = {}) {
  return mp.postJson(String(url || '').trim(), data || {}, extraHeader)
}

module.exports = {
  baseUrl,
  erpApiBaseList,
  hasMerchantApi,
  merchantRequest,
  merchantGetUrl,
  merchantPostUrl,
  resolveMerchantApiUrl,
  isRealDevice: mp.isPhone,
  isTransientNetError: mp.isNetReset,
  MP_BUILD_ID: mp.BUILD_ID,
}
