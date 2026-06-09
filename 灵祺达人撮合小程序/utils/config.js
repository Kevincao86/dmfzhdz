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
      // 开发者工具可直连 erp-api 调试，避免云函数多跳被误判为「网络慢」
      if (loc.MP_USE_CLOUD_PROXY === false) out.MP_USE_CLOUD_PROXY = false
    }
  } catch (_) {}
}

module.exports = out
