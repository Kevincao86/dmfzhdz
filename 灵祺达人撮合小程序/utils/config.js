/**
 * MERCHANT_API_BASE_URL 与商家 ERP / 运营后台 dev 服务根地址一致（如 http://192.168.x.x:5173）
 */
const LAN_API_HOST = ''

const host = LAN_API_HOST.trim()
const core = {
  MERCHANT_API_BASE_URL: host ? `http://${host}:5173` : '',
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  /** 仅开发调试：true 时达人推荐 Tab 临时预览 PR「推荐达人」UI（勿在生产开启） */
  MP_TEST_TALENT_ON_RECOMMEND: false,
}

let out = { ...core }
try {
  const rel = require('./config.release.js')
  if (rel && typeof rel === 'object') Object.assign(out, rel)
} catch (_) {}

/** 仅微信开发者工具使用 config.local；真机/体验版/正式版一律用 config.release（避免本机或旧根域覆盖 CS 网关） */
function shouldApplyLocalConfig() {
  try {
    return wx.getSystemInfoSync().platform === 'devtools'
  } catch {
    return false
  }
}

try {
  const loc = require('./config.local.js')
  if (loc && typeof loc === 'object' && shouldApplyLocalConfig()) {
    Object.assign(out, loc)
  } else if (loc && (loc.MERCHANT_API_BASE_URL || loc.SUPABASE_URL || loc.MP_REGISTRY_GATEWAY_BASE_URL)) {
    console.warn('[config] 真机/体验版已忽略 config.local.js，使用 config.release.js')
  }
} catch (_) {}

module.exports = out
