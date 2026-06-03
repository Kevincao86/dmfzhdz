/**
 * 经 ECS 同源 PostgREST（/rest/v1），非 Supabase 云服务。
 */
const config = require('./config.js')
const { fetchJsonWithRetry } = require('./ecsApi.js')

const WX_NET = {
  enableHttp2: false,
  enableQuic: false,
  useHighPerformanceMode: false,
}

function restBase() {
  const erp = String(config.MERCHANT_API_BASE_URL || '').trim()
  if (erp) {
    try {
      const u = new URL(erp.startsWith('http') ? erp : `https://${erp}`)
      return `${u.protocol}//${u.host}`
    } catch (_) {}
  }
  return String(config.SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function hasSupabase() {
  return Boolean(restBase() && String(config.SUPABASE_ANON_KEY || '').trim())
}

function headers() {
  return {
    apikey: config.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  }
}

function rpc(name, args) {
  if (!hasSupabase()) {
    return Promise.reject(new Error('未配置 ECS PostgREST（SUPABASE_ANON_KEY）'))
  }
  const url = `${restBase()}/rest/v1/rpc/${name}`
  return fetchJsonWithRetry(url, 'POST', args || {}, headers())
}

function insertSupportRelayMessage(row) {
  if (!hasSupabase()) {
    return Promise.reject(new Error('未配置 ECS，无法连接在线客服'))
  }
  const url = `${restBase()}/rest/v1/support_relay_messages`
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'POST',
      ...WX_NET,
      header: Object.assign(headers(), { Prefer: 'return=minimal' }),
      data: row,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
          return
        }
        const msg =
          (res.data &&
            (res.data.message || res.data.error_description || res.data.hint || res.data.error)) ||
          `发送失败 ${res.statusCode}`
        reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常'))
      },
    })
  })
}

function fetchSupportRelaySession(sessionId, guestFingerprint) {
  return rpc('support_relay_guest_fetch_session', {
    p_session_id: String(sessionId || '').trim(),
    p_guest_fingerprint: String(guestFingerprint || '').trim(),
  }).then((data) => (Array.isArray(data) ? data : []))
}

module.exports = {
  hasSupabase,
  rpc,
  fetchSupportRelaySession,
  insertSupportRelayMessage,
}
