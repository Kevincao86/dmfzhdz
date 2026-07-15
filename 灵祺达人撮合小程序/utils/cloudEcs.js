/**
 * 备案过渡：经微信云函数访问 ECS（不经过手机 Cronet → 未备案域名）
 */
const config = require('./config.js')
const mpRuntime = require('./mpRuntime.js')
const { withTimeout } = require('./fetchTimeout.js')
const ossTransport = require('./mpOssUploadTransport.js')

const FN = 'mpErpProxy'
const CLOUD_CALL_MS = 24000
/** 注册表体量大 + 云函数→轻量多跳，须与 mpErpProxy registry 45s 对齐，避免慢网误超时 */
const CLOUD_CALL_REGISTRY_MS = 50000
const CLOUD_CALL_UPLOAD_MS = 125000

const CLOUD_CALL_AI_MS = 120000

function cloudCallTimeoutMs(path) {
  const p = String(path || '')
  if (/video-upload|ice-multipart|group-qr-upload-body/i.test(p)) return CLOUD_CALL_UPLOAD_MS
  if (
    /meoo-ai-chat|meoo-ai-agent-image|meoo-douyin-goods-ai-assist|merchant\/douyin\/goods\/ai\/assist|\/api\/ai\/chat/i.test(
      p,
    )
  ) {
    return CLOUD_CALL_AI_MS
  }
  if (/registry|hall-registry|hall_registry|meoo-ops-mp-auth|publisher-display|form-relay-group-qr|group-qr-upload-init|group-qr-upload-body|recruitment-orders-patch/i.test(p)) return CLOUD_CALL_REGISTRY_MS
  return CLOUD_CALL_MS
}

function cloudReady() {
  mpRuntime.applyRuntimeConfig(config)
  if (mpRuntime.shouldForceDirect(config)) return false
  return !!(config.MP_USE_CLOUD_PROXY && String(config.MP_CLOUD_ENV || '').trim() && wx.cloud)
}

/** 仅检查云环境（开发者工具直连 ECS 时仍可调云函数，用于 IP 定位等） */
function cloudEnvReady() {
  mpRuntime.applyRuntimeConfig(config)
  return !!(String(config.MP_CLOUD_ENV || '').trim() && typeof wx !== 'undefined' && wx.cloud)
}

function callCloud(method, path, data, headers, force) {
  const m = String(method || 'GET').toUpperCase()
  if (m === 'POST' && ossTransport.isOssUploadRequest(path, data)) {
    return ossTransport.postOssUpload(path, data, headers)
  }
  mpRuntime.applyRuntimeConfig(config)
  if (!force && !cloudReady()) {
    return Promise.reject(new Error('开发者工具已配置直连 ECS，请走 wx.request'))
  }
  if (force && !cloudEnvReady()) {
    return Promise.reject(new Error('云开发未就绪，请检查 MP_CLOUD_ENV'))
  }
  const run = new Promise((resolve, reject) => {
    if (!force && !cloudReady()) {
      reject(new Error('云开发未就绪，请检查 MP_CLOUD_ENV'))
      return
    }
    if (force && !cloudEnvReady()) {
      reject(new Error('云开发未就绪，请检查 MP_CLOUD_ENV'))
      return
    }
    wx.cloud.callFunction({
      name: FN,
      data: { method, path, body: data, headers: headers || {} },
      success(res) {
        const r = res && res.result
        if (!r) {
          reject(new Error('云函数无返回'))
          return
        }
        if (r.ok === false || (r.status && r.status >= 400)) {
          const d = r.data || {}
          let userMsg = String(d.message || d.detail || d.hint || '').trim()
          if (/请在轻量执行|git pull|ecs-deploy-auth-api/i.test(userMsg)) {
            userMsg = '后台服务未更新，请稍后再试或联系管理员'
          }
          if (userMsg && /[\u4e00-\u9fa5]/.test(userMsg)) {
            reject(new Error(userMsg))
            return
          }
          const apiErr = typeof d.error === 'string' ? d.error : ''
          reject(new Error(apiErr || userMsg || r.error || `http_${r.status}` || 'cloud_proxy_fail'))
          return
        }
        resolve(r.data != null ? r.data : {})
      },
      fail(e) {
        reject(new Error((e && e.errMsg) || 'cloud:callFunction:fail'))
      },
    })
  })
  return withTimeout(run, cloudCallTimeoutMs(path), '云函数')
}

module.exports = {
  cloudReady,
  cloudEnvReady,
  get: (path, headers) => callCloud('GET', path, undefined, headers, false),
  getForce: (path, headers) => callCloud('GET', path, undefined, headers, true),
  post: (path, data, headers) => callCloud('POST', path, data, headers, false),
  request: (method, path, data, headers) => callCloud(method, path, data, headers, false),
  requestForce: (method, path, data, headers) => callCloud(method, path, data, headers, true),
  ping: () =>
    callCloud('GET', '/api/mp-cronet-ping').catch(() =>
      callCloud('GET', '/api/meoo-erp-api-health'),
    ),
}
