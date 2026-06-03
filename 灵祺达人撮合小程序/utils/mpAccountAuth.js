const { merchantRequest } = require('./merchantApi.js')

const SESSION_KEY = 'lingqi_mp_session_token'
const ACCOUNT_KEY = 'lingqi_mp_account_v1'

function readSessionToken() {
  try {
    return String(wx.getStorageSync(SESSION_KEY) || '').trim()
  } catch {
    return ''
  }
}

function readAccount() {
  try {
    const raw = wx.getStorageSync(ACCOUNT_KEY)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

function writeSession(token, account) {
  wx.setStorageSync(SESSION_KEY, token)
  wx.setStorageSync(ACCOUNT_KEY, JSON.stringify(account || {}))
}

function clearSession() {
  try {
    wx.removeStorageSync(SESSION_KEY)
    wx.removeStorageSync(ACCOUNT_KEY)
  } catch (_) {}
}

function isLoggedIn() {
  return !!readSessionToken() && !!readAccount()
}

/** 登录与会话：一律 POST JSON 到 ECS（避免 GET 长 query 触发 Cronet reset） */
async function mpAuthRequest(action, payload = {}) {
  const token = readSessionToken()
  const header = { 'Content-Type': 'application/json' }
  if (token) header['X-Mp-Session'] = token
  const body = { action, ...payload }
  return merchantRequest('POST', '/api/meoo-ops-mp-auth', body, { header })
}

async function wxLogin(opts = {}) {
  const code = await new Promise((resolve, reject) => {
    wx.login({
      success: (r) => resolve(r.code || ''),
      fail: reject,
    })
  })
  const data = await mpAuthRequest('wx_login', {
    code,
    role: opts.role || 'talent',
    wxNickName: opts.wxNickName || '',
    wxAvatarUrl: opts.wxAvatarUrl || '',
    registerTalent: opts.registerTalent,
    registerPr: opts.registerPr,
  })
  if (data.token && data.account) {
    writeSession(data.token, data.account)
  }
  return data
}

async function passwordLogin(loginName, password) {
  const data = await mpAuthRequest('password_login', { loginName, password })
  if (data.token && data.account) writeSession(data.token, data.account)
  return data
}

async function switchRole(role) {
  const data = await mpAuthRequest('switch_role', { role })
  if (data.account) {
    writeSession(readSessionToken(), data.account)
  }
  return data
}

async function refreshSession() {
  const data = await mpAuthRequest('session', {})
  if (data.account) writeSession(readSessionToken(), data.account)
  return data
}

module.exports = {
  SESSION_KEY,
  ACCOUNT_KEY,
  readSessionToken,
  readAccount,
  writeSession,
  clearSession,
  isLoggedIn,
  wxLogin,
  passwordLogin,
  switchRole,
  refreshSession,
}
