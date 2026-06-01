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

/** 仅开发者工具模拟器使用 config.local；真机调试/体验版/正式版勿用 127.0.0.1 覆盖生产地址 */
function shouldApplyLocalConfig(loc) {
  const base = String(loc.MERCHANT_API_BASE_URL || '').trim()
  if (!base) return true
  const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(base)
  if (!isLoopback) return true
  try {
    const sys = wx.getSystemInfoSync()
    return sys.platform === 'devtools'
  } catch {
    return false
  }
}

try {
  const loc = require('./config.local.js')
  if (loc && typeof loc === 'object' && shouldApplyLocalConfig(loc)) {
    Object.assign(out, loc)
  } else if (loc && String(loc.MERCHANT_API_BASE_URL || '').trim()) {
    console.warn('[config] 真机/体验版已忽略 config.local.js 中的本机地址，使用 config.release.js')
  }
} catch (_) {}

module.exports = out
