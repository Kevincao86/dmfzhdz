/**
 * ECS 业务 API（路径 + 重试），全部经 utils/ecs.js
 */
const ecs = require('./ecs.js')

function hasApi() {
  return ecs.hasBase()
}

function bases() {
  return ecs.bases()
}

function apiUrl(path) {
  return ecs.url(path)
}

async function tryPaths(method, paths, body) {
  let lastErr
  for (const path of paths) {
    try {
      if (method === 'GET') return await ecs.get(path)
      return await ecs.post(path, body)
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found|reset|errcode:-101|cronet|request:fail/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('接口不可用')
}

function request(method, path, data) {
  return method === 'GET' ? ecs.get(path) : ecs.post(path, data)
}

module.exports = {
  BUILD_ID: ecs.BUILD_ID,
  hasApi,
  bases,
  base: ecs.base,
  apiUrl,
  request,
  tryPaths,
  get: ecs.get,
  post: ecs.post,
  ping: ecs.ping,
  isNetReset: ecs.isNetReset,
  transportLabel: ecs.transportLabel,
  useCloudProxy: ecs.useCloudProxy,
}
