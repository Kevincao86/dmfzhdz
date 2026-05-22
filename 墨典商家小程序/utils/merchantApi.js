/**
 * 与 Web ERP 同源：`VITE_MERCHANT_API_BASE_URL`（开发一般为电脑局域网 IP + 端口，如 http://192.168.1.5:5173）
 * 需在 utils/config.js 或 config.local.js 配置 MERCHANT_API_BASE_URL，小程序写入的招募单才会进入与 Web 相同的 `.meoo-dev-sync` 注册表。
 */
const config = require('./config.js')

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
function merchantRequestAuth(method, path, opts) {
  const data = opts && opts.data
  const bearerToken = opts && opts.bearerToken ? String(opts.bearerToken).trim() : ''
  const b = baseUrl()
  if (!b) {
    return Promise.reject(new Error('尚未配置商家后台 API 地址，请在 config.local.js 设置 MERCHANT_API_BASE_URL。'))
  }
  const url = `${b}${path.startsWith('/') ? path : `/${path}`}`
  const header = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (bearerToken) header.Authorization = `Bearer ${bearerToken}`
  return new Promise((resolve, reject) => {
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
        reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
      },
      fail(err) {
        const em = err && typeof err.errMsg === 'string' ? err.errMsg : '网络异常'
        reject(new Error(em))
      },
    })
  })
}

module.exports = { baseUrl, hasMerchantApi, merchantRequest, merchantRequestAuth }
