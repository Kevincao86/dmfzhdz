/**
 * 与 web supabaseClientConfig.ts 同源：小程序禁止 *.supabase.co，走 ECS PostgREST/Auth。
 * 启动时从 {MERCHANT_API_BASE_URL}/api/meoo-erp-client-config 拉 anon key。
 */
const config = require('./config.js')

const ECS_DEFAULT = 'https://mofangdianai.com'
const ECS_HOSTS = new Set([
  'cs.mofangdianai.com',
  'fws.mofangdianai.com',
  'admin.mofangdianai.com',
  'dr.mofangdianai.com',
])

const _runtime = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  ready: false,
  bootstrapping: null,
}

function trimUrl(u) {
  return String(u || '').trim().replace(/\/$/, '')
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch (_) {
    return ''
  }
}

/** cs/fws 等子域 Nginx 已反代 /auth/v1、/rest/v1，小程序须走 MERCHANT_API_BASE_URL 同源 */
function effectiveSupabaseUrl(raw, merchantBase) {
  const trimmed = trimUrl(raw)
  const base = trimUrl(merchantBase)
  const baseHost = hostFromUrl(base)

  if (base && ECS_HOSTS.has(baseHost)) {
    if (
      !trimmed ||
      /127\.0\.0\.1|localhost|:8888/i.test(trimmed) ||
      trimmed === ECS_DEFAULT ||
      trimmed === 'https://www.mofangdianai.com'
    ) {
      return base
    }
  }

  if (!trimmed && base) return base
  if (!trimmed) return ECS_DEFAULT
  return trimmed
}

function resolveSupabaseUrl() {
  const merchantBase = trimUrl(config.MERCHANT_API_BASE_URL)
  const fromRuntime = trimUrl(_runtime.supabaseUrl)
  const fromConfig = trimUrl(config.SUPABASE_URL)
  return effectiveSupabaseUrl(fromRuntime || fromConfig, merchantBase)
}

function resolveSupabaseAnonKey() {
  const fromRuntime = trimUrl(_runtime.supabaseAnonKey)
  const fromConfig = trimUrl(config.SUPABASE_ANON_KEY)
  return fromRuntime || fromConfig
}

function isReady() {
  return _runtime.ready
}

function fetchClientConfigOnce() {
  const base = trimUrl(config.MERCHANT_API_BASE_URL)
  if (!base) return Promise.resolve(false)

  return new Promise((resolve) => {
    wx.request({
      url: `${base}/api/meoo-erp-client-config`,
      method: 'GET',
      header: { Accept: 'application/json' },
      timeout: 15000,
      success(res) {
        const j = res.data && typeof res.data === 'object' ? res.data : {}
        const anon = String(j.supabaseAnonKey || '').trim()
        if (res.statusCode < 200 || res.statusCode >= 300 || j.ok === false || !anon) {
          resolve(false)
          return
        }
        _runtime.supabaseAnonKey = anon
        _runtime.supabaseUrl = effectiveSupabaseUrl(
          String(j.supabaseUrl || '').trim() || trimUrl(config.SUPABASE_URL),
          base,
        )
        _runtime.ready = true
        resolve(true)
      },
      fail() {
        resolve(false)
      },
    })
  })
}

/** 启动时拉轻量 client-config；已配置 SUPABASE_ANON_KEY 时跳过网络 */
function bootstrap() {
  if (_runtime.ready) return Promise.resolve(true)
  if (resolveSupabaseAnonKey() && resolveSupabaseUrl()) {
    _runtime.ready = true
    return Promise.resolve(true)
  }
  if (_runtime.bootstrapping) return _runtime.bootstrapping
  _runtime.bootstrapping = fetchClientConfigOnce().finally(() => {
    _runtime.bootstrapping = null
  })
  return _runtime.bootstrapping
}

module.exports = {
  bootstrap,
  effectiveSupabaseUrl,
  resolveSupabaseUrl,
  resolveSupabaseAnonKey,
  isReady,
}
