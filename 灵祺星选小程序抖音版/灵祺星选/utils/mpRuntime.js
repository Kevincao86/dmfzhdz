/**
 * 运行环境：仅微信开发者工具内允许 IP 直连 ECS
 * 真机体验版/正式版须走云函数或 https://mofangdianai.com（微信合法域名不允许裸 IP）
 */
let cachedLocalDev = null
let cachedDeviceInfo = null

function resetRuntimeCache() {
  cachedLocalDev = null
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
    // 仅「开发版」；体验版 trial 在真机上须走云函数/合法域名，不可当作本地调试
    return ver === 'develop'
  } catch {
    return false
  }
}

function isPhoneRuntime() {
  try {
    if (typeof wx === 'undefined') return false
    const dev = readDeviceInfo()
    return !!(dev && dev.platform && dev.platform !== 'devtools')
  } catch {
    return true
  }
}

/** 安卓微信分享卡片 imageUrl 不接受 USER_DATA_PATH 缓存，须 https 或包内路径 */
function isAndroidWechat() {
  try {
    if (typeof wx === 'undefined') return false
    const dev = readDeviceInfo()
    if (dev && String(dev.platform || '').toLowerCase() === 'android') return true
    if (typeof wx.getSystemInfoSync === 'function') {
      const sys = wx.getSystemInfoSync()
      return String(sys.platform || '').toLowerCase() === 'android'
    }
  } catch (_) {}
  return false
}

function readLocalConfig() {
  try {
    const loc = require('./config.local.js')
    return loc && typeof loc === 'object' ? loc : null
  } catch {
    return null
  }
}

function hasLocalDevConfig() {
  return !!readLocalConfig()
}

/** config.local 显式 MP_USE_CLOUD_PROXY: true 时才在开发者工具走云函数 */
function localWantsCloudProxy() {
  const loc = readLocalConfig()
  return !!(loc && loc.MP_USE_CLOUD_PROXY === true)
}

/** 本机调试（仅开发者工具）或存在 config.local */
function isLocalDevRuntime() {
  if (typeof wx === 'undefined') return hasLocalDevConfig()
  if (cachedLocalDev !== null) return cachedLocalDev
  cachedLocalDev = isDevtoolsEnv() || (hasLocalDevConfig() && isDevtoolsEnv())
  return cachedLocalDev
}

function shouldForceDirect(config) {
  if (localWantsCloudProxy()) return false
  // 真机永不 IP 直连（会触发 url not in domain list）
  if (isPhoneRuntime()) return false
  // 仅开发者工具内默认直连 ECS（config.local 可改走云函数）
  return isDevtoolsEnv()
}

function applyRuntimeConfig(target) {
  const cfg = target
  if (!cfg || typeof cfg !== 'object') return cfg

  const loc = readLocalConfig()
  if (loc) Object.assign(cfg, loc)

  if (shouldForceDirect(cfg)) {
    cfg.MP_USE_CLOUD_PROXY = false
  }

  if (!cfg.MP_USE_CLOUD_PROXY && shouldForceDirect(cfg)) {
    const ip = String(cfg.MP_ERP_IP || '').trim()
    if (ip) {
      const extras = Array.isArray(cfg.MP_API_BASES) ? cfg.MP_API_BASES.slice() : []
      const httpIp = `http://${ip}/erp-api`
      if (!extras.includes(httpIp)) extras.unshift(httpIp)
      cfg.MP_API_BASES = extras
      if (!String(cfg.MERCHANT_API_BASE_URL || '').includes(ip)) {
        cfg.MERCHANT_API_BASE_URL = httpIp
      }
    }
  }

  return cfg
}

function shouldUseCloudProxy(config) {
  applyRuntimeConfig(config)
  if (shouldForceDirect(config)) return false
  const env = String(config.MP_CLOUD_ENV || '').trim()
  return !!(config.MP_USE_CLOUD_PROXY && env && typeof wx !== 'undefined' && wx.cloud)
}

module.exports = {
  resetRuntimeCache,
  isDevtoolsEnv,
  hasLocalDevConfig,
  isDevelopEnv,
  isPhoneRuntime,
  isAndroidWechat,
  isLocalDevRuntime,
  localWantsCloudProxy,
  shouldForceDirect,
  applyRuntimeConfig,
  shouldUseCloudProxy,
}
