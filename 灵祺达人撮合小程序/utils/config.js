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

if (isDevtools()) {
  try {
    const loc = require('./config.local.js')
    if (loc) {
      if (loc.MERCHANT_API_BASE_URL) Object.assign(out, loc)
      // 开发者工具可直连 erp-api 调试，避免云函数未部署/超时导致白屏
      if (loc.MP_USE_CLOUD_PROXY === false) {
        out.MP_USE_CLOUD_PROXY = false
      } else if (loc.MP_USE_CLOUD_PROXY !== true && loc.MERCHANT_API_BASE_URL) {
        out.MP_USE_CLOUD_PROXY = false
      }
    }
  } catch (_) {}
  // 备案期域名 reset 时，开发者工具可回退轻量 IP（见 ecs.js Host 头）
  if (!out.MP_USE_CLOUD_PROXY) {
    const ip = String(out.MP_ERP_IP || '').trim()
    if (ip) {
      const extras = Array.isArray(out.MP_API_BASES) ? out.MP_API_BASES.slice() : []
      const httpIp = `http://${ip}/erp-api`
      if (!extras.includes(httpIp)) extras.push(httpIp)
      out.MP_API_BASES = extras
    }
  }
}

module.exports = out
