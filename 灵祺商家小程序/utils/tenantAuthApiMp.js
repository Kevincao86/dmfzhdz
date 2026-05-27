/**
 * 与 web tenantRegisterApi.ts 同源：经 MERCHANT_API_BASE_URL 调用 /api/meoo-auth-*
 */
const config = require('./config.js')

function apiRoot() {
  const base = String(config.MERCHANT_API_BASE_URL || '').replace(/\/$/, '')
  return base
}

function postJson(path, body, timeoutMs) {
  const root = apiRoot()
  if (!root) {
    return Promise.resolve({
      ok: false,
      message: '未配置商家后台地址（MERCHANT_API_BASE_URL）',
    })
  }
  return new Promise((resolve) => {
    wx.request({
      url: `${root}${path}`,
      method: 'POST',
      timeout: timeoutMs || 20000,
      header: { 'Content-Type': 'application/json' },
      data: body,
      success(res) {
        const j = res.data && typeof res.data === 'object' ? res.data : {}
        const base = { httpStatus: res.statusCode }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ...j, ...base, ok: j.ok !== false })
          return
        }
        resolve({
          ...base,
          ok: false,
          error: j.error || `http_${res.statusCode}`,
          message: j.message || j.detail || `请求失败 (${res.statusCode})`,
        })
      },
      fail(err) {
        const em =
          err && typeof err.errMsg === 'string'
            ? err.errMsg
            : err && typeof err.message === 'string'
              ? err.message
              : '网络异常'
        resolve({ ok: false, httpStatus: 0, message: em })
      },
    })
  })
}

function sendAuthSms(phone) {
  return postJson('/api/meoo-auth-sms-send', { phone })
}

function registerMerchantAccount(body) {
  return postJson('/api/meoo-auth-register', body)
}

function loginWithSmsCode(body) {
  return postJson('/api/meoo-auth-sms-login', body)
}

function loginWithPassword(body) {
  return postJson('/api/meoo-auth-password-login', body)
}

function isLoginNameValid(loginName) {
  return /^[a-zA-Z0-9]{4,32}$/.test(String(loginName || '').trim())
}

function isMerchantShortNameValid(name) {
  const t = String(name || '').trim()
  if (t.length < 2 || t.length > 30) return false
  return /^[\u4e00-\u9fa5a-zA-Z0-9·（）()\-—\s]+$/.test(t)
}

function isCnMobileValid(phone) {
  return /^1\d{10}$/.test(String(phone || '').replace(/\D/g, ''))
}

module.exports = {
  sendAuthSms,
  registerMerchantAccount,
  loginWithSmsCode,
  loginWithPassword,
  isLoginNameValid,
  isMerchantShortNameValid,
  isCnMobileValid,
  apiRoot,
}
