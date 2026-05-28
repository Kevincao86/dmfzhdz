const config = require('./config.js')

function baseUrl() {
  return String(config.SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function hasSupabase() {
  return Boolean(baseUrl() && String(config.SUPABASE_ANON_KEY || '').trim())
}

function headers() {
  return {
    apikey: config.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  }
}

function rpc(name, args) {
  return new Promise((resolve, reject) => {
    if (!hasSupabase()) {
      reject(new Error('未配置 Supabase'))
      return
    }
    wx.request({
      url: `${baseUrl()}/rest/v1/rpc/${name}`,
      method: 'POST',
      header: headers(),
      data: args,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        const msg =
          (res.data &&
            (res.data.message || res.data.error_description || res.data.hint || res.data.error)) ||
          `请求失败 ${res.statusCode}`
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

function insertSupportRelayMessage(row) {
  return new Promise((resolve, reject) => {
    if (!hasSupabase()) {
      reject(new Error('未配置 Supabase，无法连接在线客服'))
      return
    }
    wx.request({
      url: `${baseUrl()}/rest/v1/support_relay_messages`,
      method: 'POST',
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

module.exports = {
  hasSupabase,
  rpc,
  fetchSupportRelaySession,
  insertSupportRelayMessage,
}
