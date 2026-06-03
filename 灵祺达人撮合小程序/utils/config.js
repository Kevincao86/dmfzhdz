/**
 * 真机/体验版/正式版仅用 config.release.js（ECS erp-api）
 * config.local.js 仅开发者工具可选覆盖
 */
const LAN_API_HOST = ''

const host = LAN_API_HOST.trim()
const core = {
  MERCHANT_API_BASE_URL: host ? `http://${host}:5173` : '',
  MP_TEST_TALENT_ON_RECOMMEND: false,
}

let out = { ...core }
try {
  const rel = require('./config.release.js')
  if (rel && typeof rel === 'object') Object.assign(out, rel)
} catch (_) {}

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
    if (/cs\.mofangdianai\.com|vercel\.app|supabase\.co/i.test(JSON.stringify(loc))) {
      console.warn('[config] config.local.js 含已废弃的 Vercel/cs/Supabase 地址，已忽略网关字段')
      delete loc.MP_GATEWAY_BASE_URL
      delete loc.MP_REGISTRY_GATEWAY_BASE_URL
      delete loc.SUPABASE_URL
      delete loc.SUPABASE_ANON_KEY
    }
    Object.assign(out, loc)
  } else if (loc && loc.MERCHANT_API_BASE_URL) {
    console.warn('[config] 真机/体验版已忽略 config.local.js，使用 config.release.js（ECS）')
  }
} catch (_) {}

module.exports = out
