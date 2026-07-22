/**
 * 服务商 Web（fws.mofangdianai.com）内嵌页 URL
 * 小程序 web-view 与浏览器会话独立，首次打开可能需在 Web 端登录一次。
 */
const api = require('./api.js')

const FWS_ORIGIN = 'https://fws.mofangdianai.com'

function encodePath(path) {
  const p = String(path || '/home').trim()
  return p.startsWith('/') ? p : `/${p}`
}

function buildFwsWebUrl(path, query) {
  const base = `${FWS_ORIGIN}${encodePath(path)}`
  const q = Object.assign({}, query || {})
  q.from = 'erp_mp'
  const token = api.getAccessToken()
  if (token) q.mp_token = token
  const qs = Object.keys(q)
    .filter((k) => q[k] != null && String(q[k]).trim() !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(q[k]))}`)
    .join('&')
  return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base
}

function fwsWebPageUrl(path, query) {
  const params = Object.assign({}, query || {}, { path: encodePath(path) })
  const qs = Object.keys(params)
    .filter((k) => params[k] != null && String(params[k]).trim() !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&')
  return `/pages/fws-web/fws-web?${qs}`
}

module.exports = {
  FWS_ORIGIN,
  buildFwsWebUrl,
  fwsWebPageUrl,
}
