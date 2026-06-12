const ecs = require('./cloudEcs.js')
const auth = require('./auth.js')

function authHeaders() {
  const token = auth.getToken && auth.getToken()
  return token ? { 'X-Mp-Session': token } : {}
}

/**
 * 向 ECS 请求微信官方小程序码（圆形太阳码 PNG base64）
 * @param {string} mpOrderId
 * @returns {Promise<string>} data:image/png;base64,...
 */
async function fetchApplyWxacodeDataUrl(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return ''
  try {
    const data = await ecs.post(
      '/api/meoo-ops-mp-auth',
      {
        action: 'mp_apply_wxacode_get',
        mpOrderId: id,
      },
      authHeaders(),
    )
    const url = data && data.dataUrl ? String(data.dataUrl).trim() : ''
    return url
  } catch (e) {
    console.warn('[mp] mp_apply_wxacode_get', String(e && e.message ? e.message : e).slice(0, 120))
    return ''
  }
}

module.exports = {
  fetchApplyWxacodeDataUrl,
}
