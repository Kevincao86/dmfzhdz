/**
 * MERCHANT_API_BASE_URL 与商家 ERP / 运营后台 dev 服务根地址一致（如 http://192.168.x.x:5173）
 */
const LAN_API_HOST = ''

const host = LAN_API_HOST.trim()
const core = {
  MERCHANT_API_BASE_URL: host ? `http://${host}:5173` : '',
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  /** 达人身份：推荐 Tab 展示推荐达人并置顶我的信息（本地测试） */
  MP_TEST_TALENT_ON_RECOMMEND: true,
}

let out = { ...core }
try {
  const rel = require('./config.release.js')
  if (rel && typeof rel === 'object') Object.assign(out, rel)
} catch (_) {}
try {
  const loc = require('./config.local.js')
  if (loc && typeof loc === 'object') Object.assign(out, loc)
} catch (_) {}

module.exports = out
