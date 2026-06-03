/**
 * 灵祺小程序 ↔ ECS 唯一网络层（重写）
 * 仅 https://mofangdianai.com/erp-api ，无 Vercel / Supabase 云 / cs 网关
 */
const config = require('./config.js')

const BUILD_ID = String(config.MP_BUILD_ID || 'mp-20260605-ecs-rewrite')

const NET = {
  enableHttp2: false,
  enableQuic: false,
  useHighPerformanceMode: false,
}

function erpBase() {
  return String(config.MERCHANT_API_BASE_URL || '').trim().replace(/\/$/, '')
}

function isPhone() {
  try {
    return wx.getSystemInfoSync().platform !== 'devtools'
  } catch {
    return true
  }
}

function toUrl(apiPath) {
  const base = erpBase()
  if (!base) return ''
  let p = String(apiPath || '').trim()
  if (!p.startsWith('/')) p = `/${p}`
  if (/\/erp-api\/?$/i.test(base)) {
    return `${base}/${p.replace(/^\/api\//, '')}`
  }
  return `${base}${p}`
}

function parseJson(raw) {
  if (raw == null) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return { message: String(raw) }
  }
}

function formatErr(statusCode, data) {
  const d = parseJson(data)
  const detail = String(d.detail || d.message || '').trim()
  const code = String(d.error || `http_${statusCode}`).trim()
  return detail ? `${detail}（${code}）` : code || `http_${statusCode}`
}

function readTempJson(tempPath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: tempPath,
      encoding: 'utf-8',
      success: (r) => resolve(parseJson(r.data)),
      fail: (e) => reject(new Error((e && e.errMsg) || 'read_fail')),
    })
  })
}

function wxReq(method, url, data, headers) {
  const m = String(method || 'GET').toUpperCase()
  const isGet = m === 'GET'
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: m,
      timeout: 120000,
      dataType: 'json',
      ...NET,
      header: {
        Accept: 'application/json',
        ...(isGet ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      data: isGet ? undefined : data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parseJson(res.data))
          return
        }
        reject(new Error(formatErr(res.statusCode, res.data)))
      },
      fail: (e) => reject(new Error(`${(e && e.errMsg) || 'request:fail'} → ${url}`)),
    })
  })
}

/** 真机优先 downloadFile（Cronet 栈与 wx.request 不同） */
function downloadGet(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      timeout: 120000,
      ...NET,
      success: async (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`download:${res.statusCode} → ${url}`))
          return
        }
        try {
          resolve(await readTempJson(res.tempFilePath))
        } catch (e) {
          reject(e)
        }
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'download:fail')),
    })
  })
}

function isNetReset(msg) {
  return /reset|errcode:-101|cronet|request:fail|download:fail/i.test(String(msg || ''))
}

function getJson(url, tryNo = 0) {
  const run = isPhone()
    ? () => downloadGet(url).catch(() => wxReq('GET', url))
    : () => wxReq('GET', url)
  return run().catch((err) => {
    if (tryNo < 2 && isNetReset(err.message)) {
      return new Promise((r, j) => {
        setTimeout(() => getJson(url, tryNo + 1).then(r, j), 700 * (tryNo + 1))
      })
    }
    throw err
  })
}

function postJson(url, data, headers, tryNo = 0) {
  return wxReq('POST', url, data, headers).catch((err) => {
    if (tryNo < 2 && isNetReset(err.message)) {
      return new Promise((r, j) => {
        setTimeout(() => postJson(url, data, headers, tryNo + 1).then(r, j), 700 * (tryNo + 1))
      })
    }
    throw err
  })
}

/**
 * @param {{ method?: string, path: string, body?: object, headers?: object }} opts
 * path 形如 /api/meoo-ops-mp-auth 或含 query
 */
function call(opts) {
  const base = erpBase()
  if (!base) {
    return Promise.reject(new Error('未配置 MERCHANT_API_BASE_URL'))
  }
  const method = String(opts.method || 'GET').toUpperCase()
  const headers = opts.headers || {}
  let path = String(opts.path || '')
  const body = opts.body

  if (method === 'POST' && isPhone() && /meoo-ops-mp-auth/i.test(path.split('?')[0]) && body && body.action) {
    const qs = Object.entries(body)
      .filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    return getJson(toUrl(`/api/meoo-ops-mp-auth?${qs}`))
  }

  const url = toUrl(path)
  if (method === 'GET') return getJson(url)
  return postJson(url, body, headers)
}

function ping() {
  return getJson(toUrl('/api/mp-cronet-ping')).catch(() => getJson(toUrl('/api/meoo-erp-api-health')))
}

module.exports = {
  BUILD_ID,
  erpBase,
  isPhone,
  toUrl,
  call,
  getJson,
  postJson,
  ping,
  isNetReset,
}
