const config = require('./config.js')
const { loginNameToTenantEmail } = require('./tenantAuth.js')

function loginWithPassword(loginName, password) {
  const email = loginNameToTenantEmail(loginName)
  const url = `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        apikey: config.SUPABASE_ANON_KEY,
      },
      data: { email, password },
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.access_token) {
          wx.setStorageSync('meoo_access_token', res.data.access_token)
          wx.setStorageSync('meoo_refresh_token', res.data.refresh_token || '')
          try {
            wx.setStorageSync('meoo_login_name', loginName)
          } catch (_) {}
          const app = getApp()
          if (app) app.globalData.accessToken = res.data.access_token
          resolve(res.data)
        } else {
          const msg =
            (res.data && (res.data.error_description || res.data.msg || res.data.message)) ||
            `登录失败 (${res.statusCode})`
          reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
        }
      },
      fail(err) {
        const em =
          err && typeof err.errMsg === 'string'
            ? err.errMsg
            : err && typeof err.message === 'string'
              ? err.message
              : ''
        const hint =
          /127\.0\.0\.1|localhost/i.test(config.SUPABASE_URL || '') &&
          /fail connect|timeout|CONNECTION_REFUSED|无法连接|domain/i.test(em)
            ? '（真机请改用电脑局域网 IP，见 utils/config.js 中 LAN_API_HOST 或 config.local.js）'
            : ''
        reject(new Error(em ? `${em}${hint}` : `网络异常${hint}`))
      },
    })
  })
}

function logout() {
  wx.removeStorageSync('meoo_access_token')
  wx.removeStorageSync('meoo_refresh_token')
  try {
    wx.removeStorageSync('meoo_login_name')
  } catch (_) {}
  const app = getApp()
  if (app) app.globalData.accessToken = null
}

function getAccessToken() {
  return wx.getStorageSync('meoo_access_token') || ''
}

function getRefreshToken() {
  return wx.getStorageSync('meoo_refresh_token') || ''
}

/** access_token 过期时用 refresh_token 换发；失败需重新登录 */
function refreshAccessToken() {
  const rt = getRefreshToken()
  if (!rt) {
    return Promise.reject(new Error('登录已过期，请重新登录'))
  }
  const url = `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        apikey: config.SUPABASE_ANON_KEY,
      },
      data: { refresh_token: rt },
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.access_token) {
          wx.setStorageSync('meoo_access_token', res.data.access_token)
          if (res.data.refresh_token) {
            wx.setStorageSync('meoo_refresh_token', res.data.refresh_token)
          }
          const app = getApp()
          if (app) app.globalData.accessToken = res.data.access_token
          resolve(res.data.access_token)
          return
        }
        const msg =
          (res.data && (res.data.error_description || res.data.msg || res.data.message)) ||
          `刷新登录失败 (${res.statusCode})`
        reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
      },
      fail(err) {
        const em =
          err && typeof err.errMsg === 'string'
            ? err.errMsg
            : err && typeof err.message === 'string'
              ? err.message
              : ''
        const hint =
          /127\.0\.0\.1|localhost/i.test(config.SUPABASE_URL || '') &&
          /fail connect|timeout|CONNECTION_REFUSED|无法连接|domain/i.test(em)
            ? '（真机请改用电脑局域网 IP，见 utils/config.js 中 LAN_API_HOST 或 config.local.js）'
            : ''
        reject(new Error(em ? `${em}${hint}` : `网络异常${hint}`))
      },
    })
  })
}

module.exports = { loginWithPassword, logout, getAccessToken, refreshAccessToken }
