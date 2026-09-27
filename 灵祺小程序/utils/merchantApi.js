/**
 * 与 Web ERP 同源：`VITE_MERCHANT_API_BASE_URL`（开发一般为电脑局域网 IP + 端口，如 http://192.168.1.5:5173）
 * 需在 utils/config.js 或 config.local.js 配置 MERCHANT_API_BASE_URL，小程序写入的招募单才会进入与 Web 相同的 `.meoo-dev-sync` 注册表。
 */
const config = require('./config.js')
const api = require('./api.js')

function baseUrl() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function hasMerchantApi() {
  return Boolean(baseUrl())
}

/**
 * @param {'GET'|'POST'} method
 * @param {string} path 以 / 开头，如 /api/ops-sync/registry
 * @param {Record<string, unknown>} [data] POST 体
 */
function merchantRequest(method, path, data) {
  return merchantRequestAuth(method, path, { data })
}

/**
 * 与 Web ERP 一致：平台网关接口使用 Authorization Bearer（绑定接口返回的 accessToken）。
 */
function readStoredMerchantToken() {
  try {
    return String(wx.getStorageSync('meoo_access_token') || '').trim()
  } catch (_) {
    return ''
  }
}

function merchantRequestAuth(method, path, opts) {
  const data = opts && opts.data
  const explicit = opts && opts.bearerToken ? String(opts.bearerToken).trim() : ''
  const stored = readStoredMerchantToken()
  const usesUserJwt = Boolean(explicit) && explicit === stored
  const b = baseUrl()
  if (!b) {
    return Promise.reject(new Error('尚未配置商家后台 API 地址，请在 config.local.js 设置 MERCHANT_API_BASE_URL。'))
  }
  const url = `${b}${path.startsWith('/') ? path : `/${path}`}`
  const send = (bearerToken) =>
    new Promise((resolve, reject) => {
      const header = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }
      if (bearerToken) header.Authorization = `Bearer ${bearerToken}`
      wx.request({
        url,
        method,
        header,
        data: method === 'GET' ? undefined : data,
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
            return
          }
          const msg =
            (res.data && (res.data.error || res.data.message || res.data.detail)) ||
            `请求失败 ${res.statusCode}`
          const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
          err.statusCode = res.statusCode
          err.payload = res.data
          reject(err)
        },
        fail(err) {
          const em = err && typeof err.errMsg === 'string' ? err.errMsg : '网络异常'
          reject(new Error(em))
        },
      })
    })
  const prepare = usesUserJwt ? api.ensureFreshAccessToken().catch(() => stored) : Promise.resolve(explicit)
  return prepare.then((fresh) => {
    const bearer = usesUserJwt ? readStoredMerchantToken() || fresh || explicit : explicit
    return send(bearer).catch((err) => {
      if (!usesUserJwt || !api.isStaleAccessError(err && err.statusCode, (err && err.payload) || err)) {
        throw err
      }
      return api.refreshAccessToken().then((next) => send(next))
    })
  })
}

/**
 * 自定义 Header（多单平台令牌等）。
 * @param {'GET'|'POST'} method
 * @param {string} path
 * @param {{ data?: Record<string, unknown>; headers?: Record<string, string> }} [opts]
 */
function merchantRequestWithHeaders(method, path, opts) {
  const b = baseUrl()
  if (!b) {
    return Promise.reject(new Error('尚未配置商家后台 API 地址，请在 config.local.js 设置 MERCHANT_API_BASE_URL。'))
  }
  const url = `${b}${path.startsWith('/') ? path : `/${path}`}`
  const header = Object.assign(
    { Accept: 'application/json', 'Content-Type': 'application/json' },
    (opts && opts.headers) || {},
  )
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      header,
      data: method === 'GET' ? undefined : opts?.data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        const msg =
          (res.data && (res.data.error || res.data.message || res.data.detail)) ||
          `请求失败 ${res.statusCode}`
        reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
      },
      fail(err) {
        const em = err && typeof err.errMsg === 'string' ? err.errMsg : '网络异常'
        reject(new Error(em))
      },
    })
  })
}

module.exports = {
  baseUrl,
  hasMerchantApi,
  merchantRequest,
  merchantRequestAuth,
  merchantRequestWithHeaders,
}
