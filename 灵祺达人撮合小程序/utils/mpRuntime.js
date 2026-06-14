/**
 * 运行环境判断 + 开发者工具/本机 config.local 直连 ECS
 * （模拟器 platform 可能为 ios，不能仅靠 platform === 'devtools'）
 */

function readSystemInfo() {
  try {
    return wx.getSystemInfoSync()
  } catch {
    return null
  }
}

function isDevtoolsEnv() {
  try {
    if (typeof wx === 'undefined') return false
    const sys = readSystemInfo()
    if (sys) {
      if (sys.platform === 'devtools') return true
      if (String(sys.brand || '').toLowerCase() === 'devtools') return true
    }
    if (typeof wx.getAppBaseInfo === 'function') {
      const app = wx.getAppBaseInfo()
      const host = app && app.host
      const env = String((host && host.env) || host || '').toLowerCase()
      if (/devtools|wechatdevtools/.test(env)) return true
    }
  } catch (_) {}
  return false
}

function hasLocalDevConfig() {
  try {
    const loc = require('./config.local.js')
    return !!(loc && typeof loc === 'object')
  } catch {
    return false
  }
}

/** 本机调试（config.local 存在）或微信开发者工具 → 默认直连 */
function isLocalDevRuntime() {
  return hasLocalDevConfig() || isDevtoolsEnv()
}

function applyRuntimeConfig(target) {
  const cfg = target
  if (!cfg || typeof cfg !== 'object') return cfg
  try {
    const loc = require('./config.local.js')
    if (loc && typeof loc === 'object') {
      if (loc.MERCHANT_API_BASE_URL) Object.assign(cfg, loc)
      if (loc.MP_USE_CLOUD_PROXY === true) cfg.MP_USE_CLOUD_PROXY = true
      else if (loc.MP_USE_CLOUD_PROXY === false) cfg.MP_USE_CLOUD_PROXY = false
    }
  } catch (_) {}

  if (isLocalDevRuntime() && cfg.MP_USE_CLOUD_PROXY !== true) {
    cfg.MP_USE_CLOUD_PROXY = false
  }

  if (!cfg.MP_USE_CLOUD_PROXY) {
    const ip = String(cfg.MP_ERP_IP || '').trim()
    if (ip) {
      const extras = Array.isArray(cfg.MP_API_BASES) ? cfg.MP_API_BASES.slice() : []
      const httpIp = `http://${ip}/erp-api`
      if (!extras.includes(httpIp)) extras.push(httpIp)
      cfg.MP_API_BASES = extras
    }
  }

  return cfg
}

function shouldUseCloudProxy(config) {
  applyRuntimeConfig(config)
  if (isLocalDevRuntime() && config.MP_USE_CLOUD_PROXY !== true) return false
  const env = String(config.MP_CLOUD_ENV || '').trim()
  return !!(config.MP_USE_CLOUD_PROXY && env && typeof wx !== 'undefined' && wx.cloud)
}

module.exports = {
  isDevtoolsEnv,
  hasLocalDevConfig,
  isLocalDevRuntime,
  applyRuntimeConfig,
  shouldUseCloudProxy,
}
