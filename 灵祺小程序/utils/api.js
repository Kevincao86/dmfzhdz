const config = require('./config.js')
const { loginNameToTenantEmail } = require('./tenantAuth.js')
const devAuth = require('./devAuth.js')
const sessionSync = require('./merchantSessionSyncMp.js')
const tenantAuthApi = require('./tenantAuthApiMp.js')

const REQUEST_TIMEOUT_MS = 20000

function persistSession(tokens, loginName) {
  if (!tokens || !tokens.access_token) return
  wx.setStorageSync('meoo_access_token', tokens.access_token)
  wx.setStorageSync('meoo_refresh_token', tokens.refresh_token || '')
  if (loginName) {
    try {
      wx.setStorageSync('meoo_login_name', loginName)
    } catch (_) {}
  }
  const app = getApp()
  if (app) app.globalData.accessToken = tokens.access_token
  void sessionSync.syncFromCloud({ force: true })
}

function loginWithPasswordDirect(loginName, password) {
  const email = loginNameToTenantEmail(loginName)
  const url = `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`
  const anonKey = config.SUPABASE_ANON_KEY
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'POST',
      timeout: REQUEST_TIMEOUT_MS,
      header: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      data: { email, password },
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.access_token) {
          persistSession(res.data, loginName)
          resolve(res.data)
        } else {
          const msg =
            (res.data && (res.data.error_description || res.data.msg || res.data.message)) ||
            `登录失败 (${res.statusCode})`
          const text = typeof msg === 'string' ? msg : JSON.stringify(msg)
          reject(new Error(/invalid login/i.test(text) ? '账号或密码错误' : text))
        }
      },
      fail(err) {
        const em =
          err && typeof err.errMsg === 'string'
            ? err.errMsg
            : err && typeof err.message === 'string'
              ? err.message
              : ''
        const isTimeout = /timeout|timed out|超时/i.test(em)
        const hint =
          /127\.0\.0\.1|localhost/i.test(config.SUPABASE_URL || '') &&
          /fail connect|timeout|CONNECTION_REFUSED|无法连接|domain/i.test(em)
            ? '（真机请改用电脑局域网 IP，见 utils/config.js 中 LAN_API_HOST 或 config.local.js）'
            : ''
        reject(
          new Error(
            isTimeout
              ? '登录请求超时，请检查网络或稍后重试'
              : em
                ? `${em}${hint}`
                : `网络异常${hint}`,
          ),
        )
      },
    })
  })
}

function loginWithPassword(loginName, password) {
  if (tenantAuthApi.apiRoot()) {
    return tenantAuthApi.loginWithPassword({ loginName, password }).then((r) => {
      if (r.httpStatus === 404 || r.error === 'http_404') {
        return loginWithPasswordDirect(loginName, password)
      }
      if (!r.ok || !r.access_token) {
        throw new Error(r.message || r.detail || '登录失败')
      }
      persistSession(
        { access_token: r.access_token, refresh_token: r.refresh_token || '' },
        r.loginName || loginName,
      )
      return { access_token: r.access_token, refresh_token: r.refresh_token }
    })
  }
  return loginWithPasswordDirect(loginName, password)
}

function logout() {
  sessionSync.clearMerchantSessionLocal()
  wx.removeStorageSync('meoo_access_token')
  wx.removeStorageSync('meoo_refresh_token')
  try {
    wx.removeStorageSync('meoo_login_name')
    wx.removeStorageSync('meoo_erp_merchant_display_name')
    wx.removeStorageSync('meoo_ai_model_picker_key')
  } catch (_) {}
  const app = getApp()
  if (app) app.globalData.accessToken = null
}

/** 打开登录页（tabBar 页退出时 reLaunch 优先，失败则 navigateTo） */
function openLoginPage() {
  const url = '/pages/login/login'
  wx.reLaunch({
    url,
    fail() {
      wx.navigateTo({ url })
    },
  })
}

/** 退出并回到登录页 */
function logoutAndGoLogin() {
  logout()
  try {
    wx.setStorageSync('meoo_just_logged_out', '1')
  } catch (_) {}
  openLoginPage()
}

function getAccessToken() {
  return wx.getStorageSync('meoo_access_token') || ''
}

function isAuthed() {
  return Boolean(getAccessToken())
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

function goLogin() {
  openLoginPage()
}

module.exports = {
  loginWithPassword,
  persistSession,
  logout,
  openLoginPage,
  logoutAndGoLogin,
  getAccessToken,
  refreshAccessToken,
  isAuthed,
  goLogin,
}
