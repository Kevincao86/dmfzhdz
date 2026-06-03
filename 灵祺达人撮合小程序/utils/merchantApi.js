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

/** ECS /erp-api 与 Web 商家端一致：基址含 erp-api 时去掉路径前缀 /api/ */
function resolveMerchantApiUrl(path) {
  const b = baseUrl()
  if (!b) return ''
  const p = path.startsWith('/') ? path : `/${path}`
  if (/\/erp-api\/?$/i.test(b) || b.includes('/erp-api/')) {
    const rel = p.replace(/^\/api\//, '')
    return `${b.replace(/\/$/, '')}/${rel}`
  }
  return `${b}${p}`
}

/** 微信 Cronet：关 http2/quic/高性能模式。勿开 enableHttpDNS（须公众平台配置 serviceId，否则 invalid httpDNSServiceId） */
const WX_NET = {
  enableHttp2: false,
  enableQuic: false,
  useHighPerformanceMode: false,
}

const WX_HEADERS_GET = {
  Accept: 'application/json',
}

const WX_HEADERS_JSON = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

function isTransientNetError(errMsg) {
  return /reset|errcode:-101|cronet_error|timeout|超时/i.test(String(errMsg || ''))
}

function merchantGetViaDownload(url) {
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
              resolve(JSON.parse(String(fileRes.data || '')))
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

/** 根域 / api 子域走 download 优先；cs.* 走常规 request */
function shouldUseCronetWorkaround(url) {
  try {
    const h = new URL(url).hostname
    return (
      h === 'mofangdianai.com' ||
      h === 'www.mofangdianai.com' ||
      h === 'api.mofangdianai.com'
    )
  } catch {
    return /mofangdianai\.com/i.test(String(url || ''))
  }
}

function merchantGetUrl(url) {
  const u = String(url || '').trim()
  if (!u) return Promise.reject(new Error('缺少请求 URL'))
  return runGetWithFallback(u)
}

function requestTimeoutMs(url) {
  try {
    const host = new URL(String(url || '')).hostname
    if (/cs\.mofangdianai\.com/i.test(host)) return 35000
  } catch (_) {}
  return 120000
}

function wxRequestPromise(url, m, data, extraHeader = {}) {
  const isGet = String(m || 'GET').toUpperCase() === 'GET'
  const header = { ...(isGet ? WX_HEADERS_GET : WX_HEADERS_JSON), ...extraHeader }
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: m,
      timeout: requestTimeoutMs(url),
      ...WX_NET,
      header,
      data: isGet ? undefined : data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
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

function isRealDevice() {
  try {
    return wx.getSystemInfoSync().platform !== 'devtools'
  } catch {
    return true
  }
}

function runGetWithFallback(url) {
  const tryRequest = () =>
    wxRequestPromise(url, 'GET', undefined).catch((err) => {
      const errMsg = String(err && err.message ? err.message : err)
      if (!isTransientNetError(errMsg)) throw err
      return merchantGetViaDownload(url)
    })

  const tryDownloadFirst = () =>
    merchantGetViaDownload(url).catch(() => tryRequest())

  if (shouldUseCronetWorkaround(url) && isRealDevice()) {
    return tryDownloadFirst()
  }
  return tryRequest()
}

function merchantRequest(method, path, data, attemptOrOpts = 0) {
  const b = baseUrl()
  if (!b) {
    return Promise.reject(new Error('尚未配置后台地址'))
  }
  let attempt = 0
  let extraHeader = {}
  if (typeof attemptOrOpts === 'number') attempt = attemptOrOpts
  else if (attemptOrOpts && typeof attemptOrOpts === 'object') {
    attempt = Number(attemptOrOpts.attempt) || 0
    extraHeader = attemptOrOpts.header || {}
  }
  const url = resolveMerchantApiUrl(path)
  const m = String(method || 'GET').toUpperCase()

  if (m === 'GET') {
    return runGetWithFallback(url).catch((err) => {
      if (attempt < 1) return merchantRequest(m, path, data, { attempt: 1, header: extraHeader })
      throw err
    })
  }

  const runPost = (tryNo) =>
    wxRequestPromise(url, m, data, extraHeader).catch((err) => {
      const errMsg = String(err && err.message ? err.message : err)
      if (tryNo < 2 && isTransientNetError(errMsg)) {
        return new Promise((resolve, reject) => {
          setTimeout(() => runPost(tryNo + 1).then(resolve, reject), 500 * (tryNo + 1))
        })
      }
      if (isTransientNetError(errMsg) && shouldUseCronetWorkaround(url) && isRealDevice()) {
        throw new Error(
          `${errMsg}\n\n微信登录请使用 GET（构建号 mp-wx-login-get）。ECS: bash scripts/ecs-fix-mp-wechat-login.sh`,
        )
      }
      throw err
    })

  return runPost(attempt)
}

function merchantPostUrl(url, data, extraHeader = {}) {
  const u = String(url || '').trim()
  if (!u) return Promise.reject(new Error('缺少请求 URL'))
  return wxRequestPromise(u, 'POST', data || {}, extraHeader)
}

module.exports = {
  baseUrl,
  hasMerchantApi,
  merchantRequest,
  merchantGetUrl,
  merchantPostUrl,
  resolveMerchantApiUrl,
  isRealDevice,
  isTransientNetError,
}
