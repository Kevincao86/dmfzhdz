/**
 * 小程序 ↔ ECS 唯一数据通道（https://mofangdianai.com/erp-api）
 * 不使用 Vercel、不使用 Supabase 云、不使用 cs 子域网关。
 */
const config = require('./config.js')

const MP_BUILD_ID = String(config.MP_BUILD_ID || 'mp-20260604-ecs-only')

const WX_NET = {
  enableHttp2: false,
  enableQuic: false,
  useHighPerformanceMode: false,
}

function erpBase() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function hasEcsApi() {
  const b = erpBase()
  return /^https:\/\/.+\/erp-api$/i.test(b)
}

function resolveUrl(apiPath) {
  const base = erpBase()
  if (!base) return ''
  const p = String(apiPath || '').startsWith('/') ? apiPath : `/${apiPath}`
  if (/\/erp-api\/?$/i.test(base)) {
    const rel = p.replace(/^\/api\//, '')
    return `${base}/${rel}`
  }
  return `${base}${p}`
}

function parseJson(data) {
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
  const d = parseJson(data)
  const detail = String(d.detail || d.message || '').trim()
  const code = String(d.error || `http_${statusCode}`).trim()
  const hint = String(d.hint || '').trim()
  if (detail && code !== detail) {
    return hint ? `${detail}（${code}）— ${hint}` : `${detail}（${code}）`
  }
  if (hint) return `${code} — ${hint}`
  return code || `请求失败 ${statusCode}`
}

function isAuthApiPath(apiPath) {
  return /meoo-ops-mp-auth/i.test(String(apiPath || ''))
}

function payloadToQuery(data) {
  const parts = []
  for (const [k, v] of Object.entries(data || {})) {
    if (v == null || v === '') continue
    if (typeof v === 'object') continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.join('&')
}

function isTransientNetError(errMsg) {
  return /reset|errcode:-101|cronet_error|timeout|超时|download:fail|request:fail/i.test(
    String(errMsg || ''),
  )
}

function isRealDevice() {
  try {
    return wx.getSystemInfoSync().platform !== 'devtools'
  } catch {
    return true
  }
}

function getViaDownload(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      timeout: 120000,
      ...WX_NET,
      success(res) {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`download:${res.statusCode} → ${url}`))
          return
        }
        wx.getFileSystemManager().readFile({
          filePath: res.tempFilePath,
          encoding: 'utf-8',
          success(fileRes) {
            try {
              resolve(parseJson(String(fileRes.data || '')))
            } catch {
              reject(new Error(`JSON 解析失败 → ${url}`))
            }
          },
          fail(e) {
            reject(new Error((e && e.errMsg) || '读下载文件失败'))
          },
        })
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '下载失败'))
      },
    })
  })
}

function wxRequestJson(url, method, data, extraHeader = {}) {
  const m = String(method || 'GET').toUpperCase()
  const isGet = m === 'GET'
  const header = {
    Accept: 'application/json',
    ...(isGet ? {} : { 'Content-Type': 'application/json' }),
    ...extraHeader,
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: m,
      timeout: 120000,
      ...WX_NET,
      header,
      data: isGet ? undefined : data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parseJson(res.data))
          return
        }
        reject(new Error(formatHttpError(res.statusCode, res.data)))
      },
      fail(err) {
        reject(new Error(`${(err && err.errMsg) || '网络异常'} → ${url}`))
      },
    })
  })
}

function fetchJsonWithRetry(url, method, data, extraHeader, tryNo = 0) {
  const m = String(method || 'GET').toUpperCase()
  const run = () => {
    if (m === 'GET' && isRealDevice()) {
      return getViaDownload(url).catch(() => wxRequestJson(url, m, data, extraHeader))
    }
    return wxRequestJson(url, m, data, extraHeader)
  }
  return run().catch((err) => {
    const msg = String(err && err.message ? err.message : err)
    if (tryNo < 2 && isTransientNetError(msg)) {
      return new Promise((resolve, reject) => {
        setTimeout(
          () => fetchJsonWithRetry(url, method, data, extraHeader, tryNo + 1).then(resolve, reject),
          600 * (tryNo + 1),
        )
      })
    }
    throw err
  })
}

/** 真机 Cronet：登录类 POST 易 reset，改 GET + downloadFile（服务端已支持 query） */
function ecsAuthRequest(method, apiPath, data, extraHeader) {
  const m = String(method || 'GET').toUpperCase()
  const basePath = String(apiPath || '').split('?')[0]
  if (m === 'POST' && isRealDevice() && isAuthApiPath(basePath) && data && data.action) {
    const qs = payloadToQuery(data)
    const getPath = qs ? `${basePath}?${qs}` : basePath
    const getUrl = resolveUrl(getPath)
    return fetchJsonWithRetry(getUrl, 'GET', undefined, extraHeader).catch((err) => {
      const postUrl = resolveUrl(basePath)
      return fetchJsonWithRetry(postUrl, 'POST', data, extraHeader).catch(() => {
        throw err
      })
    })
  }
  const url = resolveUrl(apiPath)
  return fetchJsonWithRetry(url, m, data, extraHeader)
}

function ecsRequest(method, apiPath, data, opts = {}) {
  const url = resolveUrl(apiPath)
  if (!url) {
    return Promise.reject(new Error('尚未配置 ECS 地址（config.release MERCHANT_API_BASE_URL）'))
  }
  const extraHeader = opts.header || {}
  const m = String(method || 'GET').toUpperCase()
  if (m === 'POST' && isRealDevice() && isAuthApiPath(apiPath.split('?')[0]) && data && data.action) {
    return ecsAuthRequest('POST', apiPath, data, extraHeader)
  }
  return fetchJsonWithRetry(url, m, data, extraHeader)
}

function pingEcs() {
  return fetchJsonWithRetry(resolveUrl('/api/meoo-erp-api-health'), 'GET', undefined, {})
}

module.exports = {
  MP_BUILD_ID,
  erpBase,
  hasEcsApi,
  resolveUrl,
  ecsRequest,
  ecsAuthRequest,
  pingEcs,
  fetchJsonWithRetry,
  isRealDevice,
  isTransientNetError,
}
