/** 账号会话本地存储（无其它 utils 依赖，避免与 auth / scope 循环引用） */
const SESSION_KEY = 'lingqi_mp_session_token'
const ACCOUNT_KEY = 'lingqi_mp_account_v1'

/** 退出时递增。进行中的登录同步回来后若代号变了，不得再写回会话。 */
let sessionEpoch = 0

function readSessionEpoch() {
  return sessionEpoch
}

function bumpSessionEpoch() {
  sessionEpoch += 1
  return sessionEpoch
}

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

function writeSessionPair(token, account) {
  wx.setStorageSync(SESSION_KEY, token)
  wx.setStorageSync(ACCOUNT_KEY, JSON.stringify(account || {}))
}

function clearSessionPair() {
  try {
    wx.removeStorageSync(SESSION_KEY)
    wx.removeStorageSync(ACCOUNT_KEY)
  } catch (_) {}
}

module.exports = {
  SESSION_KEY,
  ACCOUNT_KEY,
  readSessionEpoch,
  bumpSessionEpoch,
  readSessionToken,
  readAccount,
  writeSessionPair,
  clearSessionPair,
}
