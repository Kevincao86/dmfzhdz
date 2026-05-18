const config = require('./config.js')

function baseUrl() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function hasMerchantApi() {
  return Boolean(baseUrl())
}

function merchantRequest(method, path, data) {
  const b = baseUrl()
  if (!b) {
    return Promise.reject(new Error('尚未配置后台地址'))
  }
  const url = `${b}${path.startsWith('/') ? path : `/${path}`}`
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      header: { Accept: 'application/json', 'Content-Type': 'application/json' },
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
        reject(new Error((err && err.errMsg) || '网络异常'))
      },
    })
  })
}

module.exports = { baseUrl, hasMerchantApi, merchantRequest }
