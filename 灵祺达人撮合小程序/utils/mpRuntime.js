/**
 * 运行环境：本机 config.local / 开发者工具 / develop 预览 → 默认直连 ECS
 */
let cachedLocalDev = null
let configApplied = false
let cachedDeviceInfo = null

function resetRuntimeCache() {
  cachedLocalDev = null
  configApplied = false
  cachedDeviceInfo = null
}

function readDeviceInfo() {
  if (cachedDeviceInfo) return cachedDeviceInfo
  try {
    if (typeof wx.getDeviceInfo === 'function') {
      cachedDeviceInfo = wx.getDeviceInfo()
      return cachedDeviceInfo
    }
    if (typeof wx.getWindowInfo === 'function') {
      cachedDeviceInfo = wx.getWindowInfo()
      return cachedDeviceInfo
    }
  } catch (_) {}
  return null
}

function readAppHostEnv() {
  try {
    if (typeof wx.getAppBaseInfo !== 'function') return ''
    const app = wx.getAppBaseInfo()
    const host = app && app.host
    return String((host && host.env) || '').toLowerCase()
  } catch {
    return ''
  }
}

function isDevtoolsEnv() {
  try {
    if (typeof wx === 'undefined') return false
    const dev = readDeviceInfo()
    if (dev) {
      if (dev.platform === 'devtools') return true
      if (String(dev.brand || '').toLowerCase() === 'devtools') return true
    }
    const hostEnv = readAppHostEnv()
    if (/devtools|wechatdevtools/.test(hostEnv)) return true
  } catch (_) {}
  return false
}

function isDevelopEnv() {
  try {
    if (typeof wx === 'undefined' || typeof wx.getAccountInfoSync !== 'function') return false
    const acc = wx.getAccountInfoSync()
    const ver = acc && acc.miniProgram && acc.miniProgram.envVersion
    return ver === 'develop' || ver === 'trial'
  } catch {
    return false
  }
}

function hasLocalDevConfig() {
  try {
    const loc = require('./config.local.js')
    return !!(loc && typeof loc === 'object')
  } catch {
    return false
  }
}

/** 本机调试或开发者工具编译预览 → 默认直连（不依赖 platform===devtools） */
function isLocalDevRuntime() {
  if (hasLocalDevConfig()) return true
  if (typeof wx === 'undefined') return false
  if (cachedLocalDev !== null) return cachedLocalDev
  cachedLocalDev = isDevtoolsEnv() || isDevelopEnv()
  return cachedLocalDev
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
      if (!extras.includes(httpIp)) extras.unshift(httpIp)
      cfg.MP_API_BASES = extras
      if (isLocalDevRuntime() && !String(cfg.MERCHANT_API_BASE_URL || '').includes(ip)) {
        cfg.MERCHANT_API_BASE_URL = httpIp
      }
    }
  }

  configApplied = true
  return cfg
}

function shouldUseCloudProxy(config) {
  applyRuntimeConfig(config)
  if (isLocalDevRuntime() && config.MP_USE_CLOUD_PROXY !== true) return false
  const env = String(config.MP_CLOUD_ENV || '').trim()
  return !!(config.MP_USE_CLOUD_PROXY && env && typeof wx !== 'undefined' && wx.cloud)
}

module.exports = {
  resetRuntimeCache,
  isDevtoolsEnv,
  hasLocalDevConfig,
  isDevelopEnv,
  isLocalDevRuntime,
  applyRuntimeConfig,
  shouldUseCloudProxy,
}
