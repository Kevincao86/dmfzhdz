const ecs = require('./ecs.js')
const config = require('./config.js')
const accountMemberSync = require('./accountMemberSync.js')
const mpAccountLocalScope = require('./mpAccountLocalScope.js')
const sessionStore = require('./mpSessionStore.js')
const wxProfileDisplay = require('./wxProfileDisplay.js')

const { SESSION_KEY, ACCOUNT_KEY, readSessionToken, readAccount } = sessionStore

function mergeAccountProfile(prev, next) {
  if (!next) return prev || null
  const cache = wxProfileDisplay.readWxProfileCache()
  const merged = prev ? { ...prev, ...next } : { ...next }
  merged.wxNickName = wxProfileDisplay.pickWxNick(
    cache && cache.wxNickName,
    prev && prev.wxNickName,
    next.wxNickName,
  )
  merged.wxAvatarUrl = wxProfileDisplay.pickWxAvatar(
    cache && cache.wxAvatarUrl,
    prev && prev.wxAvatarUrl,
    next.wxAvatarUrl,
  )
  return merged
}

function writeSession(token, account) {
  const merged = mergeAccountProfile(readAccount(), account)
  sessionStore.writeSessionPair(token, merged)
  mpAccountLocalScope.onAccountLogin(merged)
  try {
    require('./mpAccountClientSync.js').resetSessionPullFlag()
  } catch (_) {}
  try {
    require('./mpGuestRoutes.js').clearGuestBrowse()
  } catch (_) {}
  const registryProfileSync = require('./registryProfileSync.js')
  void registryProfileSync
    .pullRegistryProfileAfterLogin()
    .then(() => {
      try {
        return require('./mpAccountClientSync.js').pullAfterLogin()
      } catch (_) {
        return null
      }
    })
    .catch(() => {})
}

function clearSession() {
  sessionStore.clearSessionPair()
  mpAccountLocalScope.onAccountLogout()
  try {
    require('./mpAccountClientSync.js').resetSessionPullFlag()
  } catch (_) {}
  wxProfileDisplay.clearWxProfileCache()
  try {
    require('./mpGuestRoutes.js').clearGuestBrowse()
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
  else if (data.account) writeSession(readSessionToken(), data.account)
  return data
}

async function wxLogin(opts = {}) {
  const nick = String(opts.wxNickName || '').trim()
  const avatar = String(opts.wxAvatarUrl || '').trim()
  if (nick || avatar) wxProfileDisplay.writeWxProfileCache({ wxNickName: nick, wxAvatarUrl: avatar })
  const code = await new Promise((resolve, reject) => {
    wx.login({ success: (r) => resolve(r.code || ''), fail: reject })
  })
  const data = await authPost(config.MP_PLATFORM === 'douyin' ? 'dy_login' : 'wx_login', {
    code,
    stableDevOpenId: accountMemberSync.ensureStableDevOpenId(),
    role: opts.role || 'talent',
    wxNickName: nick,
    wxAvatarUrl: avatar,
    registerTalent: opts.registerTalent,
    registerPr: opts.registerPr,
  })
  if (nick || avatar) {
    try {
      await updateWxProfile(nick, avatar)
    } catch (_) {}
  }
  return accountMemberSync.afterAuthSuccess(data)
}

async function passwordLogin(loginName, password) {
  const data = await authPost('password_login', { loginName, password })
  return accountMemberSync.afterAuthSuccess(data)
}

async function phoneRegister({ phone, smsCode, password, role }) {
  const data = await authPost('register', {
    phone: String(phone || '').trim(),
    smsCode: String(smsCode || '').trim(),
    password: String(password || ''),
    role: role === 'pr' ? 'pr' : 'talent',
  })
  return accountMemberSync.afterAuthSuccess(data)
}

async function sendRegisterSms(phone) {
  return ecs.post('/api/meoo-auth-sms-send', { phone: String(phone || '').trim() })
}

async function setLoginCredentials(loginName, password) {
  return authPost('set_login_credentials', {
    loginName: String(loginName || '').trim(),
    password: password == null ? '' : String(password),
  })
}

async function switchRole(role) {
  const data = await authPost('switch_role', { role })
  if (data.account) writeSession(readSessionToken(), data.account)
  return accountMemberSync.afterAuthSuccess(data)
}

async function ensureIdentity(role, workIdentity) {
  const payload = { role: role === 'pr' ? 'pr' : 'talent' }
  if (workIdentity === 'shoot' || workIdentity === 'edit' || workIdentity === 'talent') {
    payload.workIdentity = workIdentity
  }
  const data = await authPost('ensure_identity', payload)
  if (data.account) {
    writeSession(readSessionToken(), data.account)
    try {
      const switchWorkIdentity = require('./switchWorkIdentity.js')
      const wid = workIdentity || require('./userProfile.js').readIdentity()
      switchWorkIdentity.syncLocalProfilesFromAccount(data.account, wid)
    } catch (_) {}
  }
  return accountMemberSync.afterAuthSuccess(data)
}

async function refreshSession() {
  const data = await authPost('session', {})
  if (data.account) writeSession(readSessionToken(), data.account)
  return accountMemberSync.afterAuthSuccess(data)
}

/** 未登录时静默 wx.login 并建立云端会话（资料保存/注册前调用） */
async function ensureWxAuthSession(opts = {}) {
  if (isLoggedIn()) return readAccount()
  return wxLogin(opts)
}

async function updateWxProfile(wxNickName, wxAvatarUrl) {
  const nick = String(wxNickName || '').trim()
  const avatar = String(wxAvatarUrl || '').trim()
  if (nick || avatar) wxProfileDisplay.writeWxProfileCache({ wxNickName: nick, wxAvatarUrl: avatar })
  const data = await authPost('update_wx_profile', {
    wxNickName: nick,
    wxAvatarUrl: avatar,
  })
  return accountMemberSync.afterAuthSuccess(data)
}

module.exports = {
  SESSION_KEY,
  ACCOUNT_KEY,
  sendRegisterSms,
  phoneRegister,
  readSessionToken,
  readAccount,
  writeSession,
  clearSession,
  isLoggedIn,
  authHeaders,
  ensureWxAuthSession,
  wxLogin,
  passwordLogin,
  setLoginCredentials,
  switchRole,
  ensureIdentity,
  refreshSession,
  updateWxProfile,
}
