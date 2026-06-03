const { merchantRequest, isTransientNetError } = require('./merchantApi.js')
const mpGateway = require('./mpGateway.js')

const CS_AUTH_FALLBACK = 'https://cs.mofangdianai.com'

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

async function mpAuthRequestViaCs(action, payload, header) {
  const path = '/api/meoo-ops-mp-auth'
  const url = `${CS_AUTH_FALLBACK.replace(/\/$/, '')}${path}`
  try {
    return await mpGateway.gatewayPost(path, { action, ...payload }, { header })
  } catch (e) {
    const msg = String(e && e.message ? e.message : e)
    throw new Error(
      msg.indexOf(CS_AUTH_FALLBACK) >= 0
        ? msg
        : `${msg}（已改走 ${CS_AUTH_FALLBACK} 网关，请确认微信合法域名含 cs.mofangdianai.com 且 Vercel 已配置 MEOO_ERP_API_HOST_IP）`,
    )
  }
}

async function mpAuthRequest(action, payload = {}) {
  const token = readSessionToken()
  const header = { 'Content-Type': 'application/json' }
  if (token) header['X-Mp-Session'] = token
  const body = { action, ...payload }
  try {
    return await merchantRequest('POST', '/api/meoo-ops-mp-auth', body, { header })
  } catch (e) {
    const msg = String(e && e.message ? e.message : e)
    if (!isTransientNetError(msg)) throw e
    console.warn('[mp-auth] direct erp-api failed, fallback cs gateway', msg.slice(0, 160))
    return mpAuthRequestViaCs(action, payload, header)
  }
}

/** 微信 code 登录（与 Web 互通） */
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
