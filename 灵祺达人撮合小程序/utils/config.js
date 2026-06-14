/**
 * 体验版/正式版：config.release.js
 * 开发者工具：可选 config.local.js 覆盖 MERCHANT_API_BASE_URL
 */
const core = {
  MERCHANT_API_BASE_URL: '',
  MP_BUILD_ID: '',
  MP_TEST_TALENT_ON_RECOMMEND: false,
}

let out = { ...core }
try {
  Object.assign(out, require('./config.release.js'))
} catch (_) {}

function isDevtools() {
  try {
    return wx.getSystemInfoSync().platform === 'devtools'
  } catch {
    return false
  }
}

/** 开发者工具覆盖项；须在 wx 就绪后调用（app.onLaunch 会再刷一次） */
function applyDevtoolsOverrides(target) {
  const cfg = target || out
  if (!isDevtools()) return cfg
  try {
    const loc = require('./config.local.js')
    if (loc) {
      if (loc.MERCHANT_API_BASE_URL) Object.assign(cfg, loc)
      if (loc.MP_USE_CLOUD_PROXY === true) cfg.MP_USE_CLOUD_PROXY = true
      else if (loc.MP_USE_CLOUD_PROXY === false) cfg.MP_USE_CLOUD_PROXY = false
    }
  } catch (_) {}
  // 开发者工具默认直连 ECS，避免云函数多跳/未部署导致启动失败
  if (cfg.MP_USE_CLOUD_PROXY !== true) cfg.MP_USE_CLOUD_PROXY = false
  // 备案期域名 reset 时，开发者工具可回退轻量 IP（见 ecs.js Host 头）
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

applyDevtoolsOverrides(out)

module.exports = out
module.exports.applyDevtoolsOverrides = applyDevtoolsOverrides
module.exports.isDevtools = isDevtools
