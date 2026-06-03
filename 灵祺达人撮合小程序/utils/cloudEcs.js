/**
 * 备案过渡：经微信云函数访问 ECS（不经过手机 Cronet → 未备案域名）
 */
const config = require('./config.js')

const FN = 'mpErpProxy'

function cloudReady() {
  return !!(config.MP_USE_CLOUD_PROXY && String(config.MP_CLOUD_ENV || '').trim() && wx.cloud)
}

function callCloud(method, path, data, headers) {
  return new Promise((resolve, reject) => {
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
          const msg = [d.detail, d.message, r.error, `http_${r.status}`].filter(Boolean).join(' — ')
          reject(new Error(msg || 'cloud_proxy_fail'))
          return
        }
        resolve(r.data != null ? r.data : {})
      },
      fail(e) {
        reject(new Error((e && e.errMsg) || 'cloud:callFunction:fail'))
      },
    })
  })
}

module.exports = {
  cloudReady,
  get: (path, headers) => callCloud('GET', path, undefined, headers),
  post: (path, data, headers) => callCloud('POST', path, data, headers),
  request: (method, path, data, headers) => callCloud(method, path, data, headers),
  ping: () =>
    callCloud('GET', '/api/mp-cronet-ping').catch(() =>
      callCloud('GET', '/api/meoo-erp-api-health'),
    ),
}
