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

/** 微信 Cronet：关 http2/quic/高性能模式，贴近 Safari 握手 */
const WX_NET = {
  enableHttp2: false,
  enableQuic: false,
  useHighPerformanceMode: false,
}

const WX_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0',
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

function shouldPreferDownloadForGet(url) {
  return /mofangdianai\.com/i.test(url)
}

function wxRequestPromise(url, m, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: m,
      timeout: 120000,
      ...WX_NET,
      header: WX_HEADERS,
      data: m === 'GET' ? undefined : data,
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

function merchantRequest(method, path, data, attempt = 0) {
  const b = baseUrl()
  if (!b) {
    return Promise.reject(new Error('尚未配置后台地址'))
  }
  const url = resolveMerchantApiUrl(path)
  const m = String(method || 'GET').toUpperCase()

  if (m === 'GET' && attempt === 0 && shouldPreferDownloadForGet(url)) {
    return merchantGetViaDownload(url).catch((dlErr) => {
      const dlMsg = String(dlErr && dlErr.message ? dlErr.message : dlErr)
      return wxRequestPromise(url, m, data).catch((reqErr) => {
        const reqMsg = String(reqErr && reqErr.message ? reqErr.message : reqErr)
        if (isTransientNetError(dlMsg) || isTransientNetError(reqMsg)) {
          return merchantRequest(m, path, data, 1)
        }
        throw new Error(`[download] ${dlMsg}；[request] ${reqMsg}`)
      })
    })
  }

  return wxRequestPromise(url, m, data).catch((err) => {
    const errMsg = String(err && err.message ? err.message : err)
    if (m === 'GET' && attempt === 0 && isTransientNetError(errMsg)) {
      return merchantGetViaDownload(url).catch(() => merchantRequest(m, path, data, 1))
    }
    if (attempt < 1 && isTransientNetError(errMsg)) {
      return merchantRequest(m, path, data, 1)
    }
    throw err
  })
}

module.exports = { baseUrl, hasMerchantApi, merchantRequest, resolveMerchantApiUrl }
