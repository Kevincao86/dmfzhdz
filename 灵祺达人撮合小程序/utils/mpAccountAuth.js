const mp = require('./mpEcsClient.js')

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

function authHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = readSessionToken()
  if (token) h['X-Mp-Session'] = token
  return h
}

async function mpAuthRequest(action, payload = {}) {
  const body = { action, ...payload }
  if (mp.isPhone()) {
    const qs = Object.entries(body)
      .filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    return mp.call({
      method: 'GET',
      path: `/api/meoo-ops-mp-auth?${qs}`,
      headers: authHeaders(),
    })
  }
  return mp.call({
    method: 'POST',
    path: '/api/meoo-ops-mp-auth',
    body,
    headers: authHeaders(),
  })
}

async function wxLogin(opts = {}) {
  const code = await new Promise((resolve, reject) => {
    wx.login({ success: (r) => resolve(r.code || ''), fail: reject })
  })
  const data = await mpAuthRequest('wx_login', {
    code,
    role: opts.role || 'talent',
    wxNickName: opts.wxNickName || '',
    wxAvatarUrl: opts.wxAvatarUrl || '',
    registerTalent: opts.registerTalent,
    registerPr: opts.registerPr,
  })
  if (data.token && data.account) writeSession(data.token, data.account)
  return data
}

async function passwordLogin(loginName, password) {
  const data = await mpAuthRequest('password_login', { loginName, password })
  if (data.token && data.account) writeSession(data.token, data.account)
  return data
}

async function switchRole(role) {
  const data = await mpAuthRequest('switch_role', { role })
  if (data.account) writeSession(readSessionToken(), data.account)
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
