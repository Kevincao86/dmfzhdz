/**
 * 小程序 ↔ ECS 唯一网络层（仅 wx.request POST/GET）
 * 地址：config.MERCHANT_API_BASE_URL → https://mofangdianai.com/erp-api
 */
const config = require('./config.js')

const BUILD_ID = String(config.MP_BUILD_ID || 'mp-20260606-ecs-clean')

function base() {
  return String(config.MERCHANT_API_BASE_URL || '').trim().replace(/\/$/, '')
}

function url(path) {
  const b = base()
  if (!b) return ''
  let p = String(path || '').trim()
  if (!p.startsWith('/')) p = `/${p}`
  if (/\/erp-api\/?$/i.test(b)) return `${b}/${p.replace(/^\/api\//, '')}`
  return `${b}${p}`
}

function parseBody(raw) {
  if (raw == null) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return { message: String(raw) }
  }
}

function errMsg(status, data) {
  const d = parseBody(data)
  const detail = String(d.detail || d.message || '').trim()
  const code = String(d.error || `http_${status}`).trim()
  return detail ? `${detail}（${code}）` : code
}

function isNetReset(msg) {
  return /reset|errcode:-101|cronet|request:fail/i.test(String(msg || ''))
}

function request(method, path, data, headers, tryNo) {
  const u = url(path)
  if (!u) return Promise.reject(new Error('未配置 MERCHANT_API_BASE_URL'))
  const m = String(method || 'GET').toUpperCase()
  const isGet = m === 'GET'
  return new Promise((resolve, reject) => {
    wx.request({
      url: isGet && data && typeof data === 'object'
        ? `${u}${u.includes('?') ? '&' : '?'}${Object.entries(data)
            .filter(([, v]) => v != null && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&')}`
        : u,
      method: m,
      timeout: 120000,
      enableHttp2: false,
      enableQuic: false,
      dataType: 'json',
      header: {
        Accept: 'application/json',
        ...(isGet ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      data: isGet ? undefined : data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parseBody(res.data))
          return
        }
        reject(new Error(errMsg(res.statusCode, res.data)))
      },
      fail(e) {
        reject(new Error(`${(e && e.errMsg) || 'request:fail'} → ${u}`))
      },
    })
  }).catch((err) => {
    const n = tryNo || 0
    if (n < 2 && isNetReset(err.message)) {
      return new Promise((res, rej) => {
        setTimeout(() => request(method, path, data, headers, n + 1).then(res, rej), 800 * (n + 1))
      })
    }
    throw err
  })
}

function get(path, headers) {
  return request('GET', path, undefined, headers)
}

function post(path, data, headers) {
  return request('POST', path, data, headers)
}

function ping() {
  return get('/api/mp-cronet-ping').catch(() => get('/api/meoo-erp-api-health'))
}

module.exports = {
  BUILD_ID,
  base,
  url,
  request,
  get,
  post,
  ping,
  isNetReset,
  hasBase: () => !!base(),
}
