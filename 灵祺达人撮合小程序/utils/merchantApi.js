const config = require('./config.js')

function baseUrl() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

/** 主域 Cronet reset 时依次尝试（须 DNS：api → 与根域同 IP） */
function erpApiBaseList() {
  const out = []
  const push = (raw) => {
    const t = String(raw || '')
      .trim()
      .replace(/\/$/, '')
    if (t && !out.includes(t)) out.push(t)
  }
  push(baseUrl())
  const extras = config.MP_ERP_API_FALLBACK_BASES
  if (Array.isArray(extras)) {
    for (const item of extras) push(item)
  }
  return out
}

function hasMerchantApi() {
  return erpApiBaseList().length > 0
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

function resolveUrlWithBase(apiBase, path) {
  const b = String(apiBase || '').replace(/\/$/, '')
  if (!b) return ''
  const p = path.startsWith('/') ? path : `/${path}`
  if (/\/erp-api\/?$/i.test(b) || b.includes('/erp-api/')) {
    const rel = p.replace(/^\/api\//, '')
    return `${b}/${rel}`
  }
  return `${b}${p}`
}

/** ECS /erp-api 与 Web 商家端一致：基址含 erp-api 时去掉路径前缀 /api/ */
function resolveMerchantApiUrl(path) {
  return resolveUrlWithBase(baseUrl(), path)
}

/** 微信 Cronet：关 http2/quic/高性能模式。勿开 enableHttpDNS */
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
  return /reset|errcode:-101|cronet_error|timeout|超时|download:fail/i.test(String(errMsg || ''))
}

function isAuthApiUrl(url) {
  return /meoo-ops-mp-auth/i.test(String(url || ''))
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

/** 登录 GET：仅用 wx.request（downloadFile 对根域同样会 reset） */
function runGetRequestOnly(url, tryNo = 0) {
  return wxRequestPromise(url, 'GET', undefined).catch((err) => {
    const errMsg = String(err && err.message ? err.message : err)
    if (tryNo < 2 && isTransientNetError(errMsg)) {
      return new Promise((resolve, reject) => {
        setTimeout(() => runGetRequestOnly(url, tryNo + 1).then(resolve, reject), 500 * (tryNo + 1))
      })
    }
    throw err
  })
}

function runGetWithFallback(url) {
  if (isAuthApiUrl(url)) {
    return runGetRequestOnly(url)
  }

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

function merchantGetUrl(url) {
  const u = String(url || '').trim()
  if (!u) return Promise.reject(new Error('缺少请求 URL'))
  return runGetWithFallback(u)
}

async function merchantRequestOnBase(apiBase, method, path, data, attemptOrOpts = 0) {
  let attempt = 0
  let extraHeader = {}
  if (typeof attemptOrOpts === 'number') attempt = attemptOrOpts
  else if (attemptOrOpts && typeof attemptOrOpts === 'object') {
    attempt = Number(attemptOrOpts.attempt) || 0
    extraHeader = attemptOrOpts.header || {}
  }
  const url = resolveUrlWithBase(apiBase, path)
  const m = String(method || 'GET').toUpperCase()

  if (m === 'GET') {
    return runGetWithFallback(url).catch((err) => {
      if (attempt < 1) {
        return merchantRequestOnBase(apiBase, m, path, data, { attempt: 1, header: extraHeader })
      }
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
      throw err
    })

  return runPost(attempt)
}

function merchantRequest(method, path, data, attemptOrOpts = 0) {
  const bases = erpApiBaseList()
  if (!bases.length) {
    return Promise.reject(new Error('尚未配置后台地址'))
  }

  const attempts = []
  let lastErr
  return (async () => {
    for (const apiBase of bases) {
      try {
        return await merchantRequestOnBase(apiBase, method, path, data, attemptOrOpts)
      } catch (e) {
        lastErr = e
        const msg = String(e && e.message ? e.message : e)
        attempts.push(`[${apiBase}] ${msg.slice(0, 160)}`)
        if (!isTransientNetError(msg)) throw e
        console.warn('[mp-api] base failed, try next', apiBase, msg.slice(0, 80))
      }
    }
    const err = lastErr || new Error('所有 API 基址均失败')
    err.attempts = attempts
    throw err
  })()
}

function merchantPostUrl(url, data, extraHeader = {}) {
  const u = String(url || '').trim()
  if (!u) return Promise.reject(new Error('缺少请求 URL'))
  return wxRequestPromise(u, 'POST', data || {}, extraHeader)
}

module.exports = {
  baseUrl,
  erpApiBaseList,
  hasMerchantApi,
  merchantRequest,
  merchantGetUrl,
  merchantPostUrl,
  resolveMerchantApiUrl,
  isRealDevice,
  isTransientNetError,
}
