/**
 * 小程序 API：备案前走云函数代理，备案后直连 MERCHANT_API_BASE_URL
 */
const config = require('./config.js')
const mpRuntime = require('./mpRuntime.js')
const cloudEcs = require('./cloudEcs.js')

const BUILD_ID = String(config.MP_BUILD_ID || 'mp-20260606-cloud-proxy')

function useCloudProxy() {
  if (mpRuntime.shouldForceDirect(config)) return false
  return mpRuntime.shouldUseCloudProxy(config) && cloudEcs.cloudReady()
}

function devRequestTimeoutMs() {
  return mpRuntime.isLocalDevRuntime() ? 12000 : 120000
}

function bases() {
  mpRuntime.applyRuntimeConfig(config)
  const list = []
  const primary = String(config.MERCHANT_API_BASE_URL || '').trim().replace(/\/$/, '')
  if (primary) list.push(primary)
  const extra = config.MP_API_BASES
  if (Array.isArray(extra)) {
    for (const u of extra) {
      const s = String(u || '').trim().replace(/\/$/, '')
      if (s && !list.includes(s)) list.push(s)
    }
  }
  return list
}

function url(path, base) {
  const b = base || bases()[0] || ''
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
  const mpApiErrors = require('./mpApiErrors.js')
  const d = parseBody(data)
  let detail = String(d.message || d.detail || d.hint || '').trim()
  if (/请在轻量执行|git pull|ecs-deploy-auth-api/i.test(detail)) {
    detail = '后台服务未更新，请稍后再试或联系管理员'
  }
  const code = String(d.error || `http_${status}`).trim()
  if (detail && /[\u4e00-\u9fa5]/.test(detail)) return detail
  return mpApiErrors.formatMpApiErr(new Error(code), detail || '请求失败，请稍后重试')
}

function isNetReset(msg) {
  return /reset|errcode:-101|cronet|request:fail/i.test(String(msg || ''))
}

function isPhone() {
  try {
    const dev =
      typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : wx.getWindowInfo()
    return dev && dev.platform !== 'devtools'
  } catch {
    return true
  }
}

/** 备案期直连轻量 IP 时须带 Host（与 mpErpProxy erp-target 一致） */
function hostHeaderForBase(base) {
  const ip = String(config.MP_ERP_IP || '').trim()
  if (!ip || !base || !String(base).includes(ip)) return {}
  return { Host: ip }
}

function wxRequestOnce(method, fullUrl, data, headers, tryNo, base) {
  const m = String(method || 'GET').toUpperCase()
  const isGet = m === 'GET'
  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method: m,
      timeout: devRequestTimeoutMs(),
      enableHttp2: false,
      enableQuic: false,
      ...(tryNo > 0 && isPhone() ? { forceCellularNetwork: true } : {}),
      dataType: 'json',
      header: {
        Accept: 'application/json',
        ...(isGet ? {} : { 'Content-Type': 'application/json' }),
        ...hostHeaderForBase(base),
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
        reject(new Error(`${(e && e.errMsg) || 'request:fail'} → ${fullUrl}`))
      },
    })
  })
}

async function directRequest(method, path, data, headers, tryNo = 0, baseIdx = 0) {
  const list = bases()
  if (!list.length) return Promise.reject(new Error('未配置 MERCHANT_API_BASE_URL'))
  const base = list[baseIdx] || list[0]
  const fullUrl = url(path, base)
  try {
    return await wxRequestOnce(method, fullUrl, data, headers, tryNo, base)
  } catch (err) {
    const nextBase = baseIdx + 1
    if (nextBase < list.length && isNetReset(err.message)) {
      return directRequest(method, path, data, headers, 0, nextBase)
    }
    const n = tryNo || 0
    if (n < 2 && isNetReset(err.message)) {
      return directRequest(method, path, data, headers, n + 1, baseIdx)
    }
    throw err
  }
}

async function request(method, path, data, headers) {
  if (useCloudProxy()) {
    return cloudEcs.request(method, path, data, headers)
  }
  if (config.MP_USE_CLOUD_PROXY && !cloudEcs.cloudReady()) {
    throw new Error('已开启云代理但未配置 MP_CLOUD_ENV，见 备案过渡-云开发代理.md')
  }
  return directRequest(method, path, data, headers)
}

function get(path, headers) {
  return request('GET', path, undefined, headers)
}

function post(path, data, headers) {
  return request('POST', path, data, headers)
}

async function ping() {
  if (useCloudProxy()) return cloudEcs.ping()
  const list = bases()
  if (!list.length) throw new Error('未配置 MERCHANT_API_BASE_URL')
  let lastErr
  for (const b of list) {
    try {
      return await wxRequestOnce('GET', url('/api/mp-cronet-ping', b), undefined, {}, 0, b)
    } catch (e1) {
      try {
        return await wxRequestOnce('GET', url('/api/meoo-erp-api-health', b), undefined, {}, 0, b)
      } catch (e2) {
        lastErr = e2
      }
    }
  }
  throw lastErr || new Error('ping failed')
}

function hasBase() {
  return useCloudProxy() || bases().length > 0
}

function transportLabel() {
  return useCloudProxy() ? 'cloud-proxy' : 'direct'
}

/** 大文件经 HTTPS 直连 erp-api → 服务端写 OSS（须已配 request 合法域名 mofangdianai.com） */
function canDirectUpload() {
  mpRuntime.applyRuntimeConfig(config)
  const base = bases()[0] || ''
  if (/^https:\/\//i.test(base)) return true
  return !!httpsApiBase()
}

function httpsApiBase() {
  mpRuntime.applyRuntimeConfig(config)
  const b = String(config.MERCHANT_API_BASE_URL || '').trim().replace(/\/$/, '')
  return /^https:\/\//i.test(b) ? b : ''
}

/** 群码等大 body：真机也直连 https 合法域名，绕过云函数 callFunction 体积/超时限制 */
async function postHttpsBypassCloud(path, data, headers) {
  const base = httpsApiBase()
  if (!base) return Promise.reject(new Error('no_https_api'))
  const fullUrl = url(path, base)
  let lastErr
  for (let tryNo = 0; tryNo < 3; tryNo += 1) {
    try {
      const res = await wxRequestOnce('POST', fullUrl, data, headers, tryNo, base)
      if (res && res.ok === false) {
        throw new Error(String(res.detail || res.error || 'request_failed'))
      }
      return res
    } catch (e) {
      lastErr = e
      if (!isNetReset(String((e && e.message) || e))) break
    }
  }
  throw lastErr || new Error('https_post_failed')
}

function postDirect(path, data, headers) {
  return directRequest('POST', path, data, headers)
}

module.exports = {
  BUILD_ID,
  bases,
  base: () => bases()[0] || '',
  url,
  request,
  get,
  post,
  postDirect,
  ping,
  isNetReset,
  hasBase,
  isPhone,
  useCloudProxy,
  canDirectUpload,
  httpsApiBase,
  postHttpsBypassCloud,
  transportLabel,
}
