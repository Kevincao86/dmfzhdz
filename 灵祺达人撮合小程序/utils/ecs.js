/**
 * 小程序 API：备案前走云函数代理，备案后直连 MERCHANT_API_BASE_URL
 */
const config = require('./config.js')
const cloudEcs = require('./cloudEcs.js')

const BUILD_ID = String(config.MP_BUILD_ID || 'mp-20260606-cloud-proxy')

function isDevtoolsRuntime() {
  try {
    if (typeof config.isDevtools === 'function') return config.isDevtools()
    return wx.getSystemInfoSync().platform === 'devtools'
  } catch {
    return false
  }
}

function useCloudProxy() {
  if (isDevtoolsRuntime() && config.MP_USE_CLOUD_PROXY !== true) return false
  return !!config.MP_USE_CLOUD_PROXY && cloudEcs.cloudReady()
}

function bases() {
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
    detail = '后台服务未更新，暂无法停止/编辑招募单，请稍后再试或联系管理员'
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
    return wx.getSystemInfoSync().platform !== 'devtools'
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
      timeout: 120000,
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

module.exports = {
  BUILD_ID,
  bases,
  base: () => bases()[0] || '',
  url,
  request,
  get,
  post,
  ping,
  isNetReset,
  hasBase,
  isPhone,
  useCloudProxy,
  transportLabel,
}
