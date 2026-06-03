const ecs = require('./ecs.js')

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
  const h = {}
  const token = readSessionToken()
  if (token) h['X-Mp-Session'] = token
  return h
}

async function authPost(action, payload = {}) {
  const data = await ecs.post('/api/meoo-ops-mp-auth', { action, ...payload }, authHeaders())
  if (data.token && data.account) writeSession(data.token, data.account)
  return data
}

async function wxLogin(opts = {}) {
  const code = await new Promise((resolve, reject) => {
    wx.login({ success: (r) => resolve(r.code || ''), fail: reject })
  })
  return authPost('wx_login', {
    code,
    role: opts.role || 'talent',
    wxNickName: opts.wxNickName || '',
    wxAvatarUrl: opts.wxAvatarUrl || '',
    registerTalent: opts.registerTalent,
    registerPr: opts.registerPr,
  })
}

async function passwordLogin(loginName, password) {
  return authPost('password_login', { loginName, password })
}

async function switchRole(role) {
  const data = await authPost('switch_role', { role })
  if (data.account) writeSession(readSessionToken(), data.account)
  return data
}

async function refreshSession() {
  const data = await authPost('session', {})
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
