const config = require('./config.js')

function baseUrl() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function hasMerchantApi() {
  return Boolean(baseUrl())
}

function parseResponseBody(data) {
  if (data == null) return {}
  if (typeof data === 'object') return data
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return { message: data }
    }
  }
  return {}
}

function formatHttpError(statusCode, data) {
  const d = parseResponseBody(data)
  const detail = String(d.detail || d.message || '').trim()
  const code = String(d.error || `http_${statusCode}`).trim()
  const hint = String(d.hint || '').trim()
  if (detail && code !== detail) {
    return hint ? `${detail}（${code}）— ${hint}` : `${detail}（${code}）`
  }
  if (hint) return `${code} — ${hint}`
  return code || `请求失败 ${statusCode}`
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
        reject(new Error(formatHttpError(res.statusCode, res.data)))
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常'))
      },
    })
  })
}

module.exports = { baseUrl, hasMerchantApi, merchantRequest }
