const config = require('./config.js')
const { loginNameToTenantEmail } = require('./tenantAuth.js')
const devAuth = require('./devAuth.js')
const tenantAuthApi = require('./tenantAuthApiMp.js')
const supabaseCfg = require('./supabaseClientConfigMp.js')

const REQUEST_TIMEOUT_MS = 20000

function merchantSessionSync() {
  return require('./merchantSessionSyncMp.js')
}

function persistSession(tokens, loginName) {
  if (!tokens || !tokens.access_token) return
  wx.setStorageSync('meoo_access_token', tokens.access_token)
  wx.setStorageSync('meoo_refresh_token', tokens.refresh_token || '')
  try {
    wx.removeStorageSync('meoo_guest_browse')
  } catch (_) {}
  if (loginName) {
    try {
      wx.setStorageSync('meoo_login_name', loginName)
    } catch (_) {}
  }
  const app = getApp()
  if (app) app.globalData.accessToken = tokens.access_token
  void merchantSessionSync().syncFromCloud({ force: true })
}

function loginWithPasswordDirect(loginName, password) {
  const email = loginNameToTenantEmail(loginName)
  const supabaseUrl = supabaseCfg.resolveSupabaseUrl()
  const anonKey = supabaseCfg.resolveSupabaseAnonKey()
  if (!supabaseUrl || !anonKey) {
    return Promise.reject(new Error('尚未拉取登录配置，请检查网络或 MERCHANT_API_BASE_URL'))
  }
  const url = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`
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
          /127\.0\.0\.1|localhost/i.test(supabaseCfg.resolveSupabaseUrl() || '') &&
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

async function loginWithPassword(loginName, password) {
  await supabaseCfg.bootstrap()
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
  merchantSessionSync().clearMerchantSessionLocal()
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

function getStoredAccessToken() {
  return String(wx.getStorageSync('meoo_access_token') || '').trim()
}

/** 含免登录游览占位 guest-browse（仅页面准入，不可作 API Bearer） */
function getAccessToken() {
  const token = getStoredAccessToken()
  if (token) return token
  if (devAuth.isDevSkipLogin()) {
    devAuth.applyDevSession()
    return devAuth.DEV_TOKEN
  }
  if (isGuestBrowsing()) return 'guest-browse'
  return ''
}

/** 真实 JWT / 开发预览 token，供 /api/meoo-ai-chat 等后端接口 */
function getBearerToken() {
  const token = getStoredAccessToken()
  if (token) return token
  if (devAuth.isDevSkipLogin()) {
    devAuth.applyDevSession()
    return devAuth.DEV_TOKEN
  }
  return ''
}

function isAuthed() {
  return Boolean(getAccessToken())
}

function isRealAuthed() {
  return Boolean(getBearerToken())
}

/** 子页面是否可进入：已登录、开发预览、免登录游览 */
function canAccessPage() {
  if (isAuthed()) return true
  if (devAuth.isDevSkipLogin()) {
    devAuth.applyDevSession()
    return true
  }
  return isGuestBrowsing()
}

function isGuestBrowsing() {
  try {
    return wx.getStorageSync('meoo_guest_browse') === '1'
  } catch (_) {
    return false
  }
}

/** 审核：未登录可先浏览 Tab/功能，不强制进登录页 */
function enterGuestBrowse() {
  try {
    wx.setStorageSync('meoo_guest_browse', '1')
  } catch (_) {}
}

function clearGuestBrowse() {
  try {
    wx.removeStorageSync('meoo_guest_browse')
  } catch (_) {}
}

/** 需真实登录时调用；游客可继续逛 */
function requireRealAuth(redirectUrl) {
  if (isRealAuthed()) return true
  enterGuestBrowse()
  const target = String(redirectUrl || '').trim()
  wx.showModal({
    title: '需要登录',
    content: '浏览无需登录。使用该功能前请先登录商家账号。',
    confirmText: '去登录',
    cancelText: '继续逛',
    success(res) {
      if (!res.confirm) return
      const url = target
        ? `/pages/login/login?redirect=${encodeURIComponent(target)}`
        : '/pages/login/login'
      wx.navigateTo({
        url,
        fail() {
          wx.reLaunch({ url })
        },
      })
    },
  })
  return false
}

/** Tab 页（功能 / 灵祺助手 / 我的）是否可进入：已登录、开发预览或免登录游览 */
function canAccessTabBar() {
  return canAccessPage()
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
  const supabaseUrl = supabaseCfg.resolveSupabaseUrl()
  const anonKey = supabaseCfg.resolveSupabaseAnonKey()
  if (!supabaseUrl || !anonKey) {
    return Promise.reject(new Error('尚未拉取登录配置，请重新登录'))
  }
  const url = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        apikey: anonKey,
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
          /127\.0\.0\.1|localhost/i.test(supabaseCfg.resolveSupabaseUrl() || '') &&
          /fail connect|timeout|CONNECTION_REFUSED|无法连接|domain/i.test(em)
            ? '（真机请改用电脑局域网 IP，见 utils/config.js 中 LAN_API_HOST 或 config.local.js）'
            : ''
        reject(new Error(em ? `${em}${hint}` : `网络异常${hint}`))
      },
    })
  })
}

function bootstrapSupabaseConfig() {
  return supabaseCfg.bootstrap()
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
  getBearerToken,
  refreshAccessToken,
  isAuthed,
  isRealAuthed,
  isGuestBrowsing,
  enterGuestBrowse,
  clearGuestBrowse,
  requireRealAuth,
  canAccessTabBar,
  canAccessPage,
  bootstrapSupabaseConfig,
  goLogin,
}
