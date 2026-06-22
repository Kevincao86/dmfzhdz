const config = require('./config.js')
const { getOauthLoginCopy } = require('./mpLoginCopy.js')

const WX_ACCOUNT_KEY = 'meoo_wx_account_v1'

function readWxAccount() {
  try {
    const raw = wx.getStorageSync(WX_ACCOUNT_KEY)
    if (!raw) return null
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!o || !String(o.wxNickName || '').trim()) return null
    return o
  } catch {
    return null
  }
}

function isWxLoggedIn() {
  try {
    const auth = require('./auth.js')
    if (auth.isLoggedIn()) return true
  } catch (_) {}
  return false
}

function writeWxAccount(patch) {
  const prev = readWxAccount() || {}
  const next = {
    wxNickName: '',
    wxAvatarUrl: '',
    wxOpenId: '',
    wxCode: '',
    loggedInAt: '',
    ...prev,
    ...patch,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
  if (!next.loggedInAt) {
    next.loggedInAt = next.updatedAt
  }
  wx.setStorageSync(WX_ACCOUNT_KEY, JSON.stringify(next))
  return next
}

function clearWxAccount() {
  try {
    wx.removeStorageSync(WX_ACCOUNT_KEY)
  } catch (_) {}
}

/** wx.login + 昵称头像写入本地账号（OpenId 需服务端 code2session 时再补） */
function completeWxLogin(profile) {
  const nick = String(profile?.wxNickName || '').trim()
  const copy = getOauthLoginCopy()
  if (!nick) {
    return Promise.reject(new Error(copy.errNickRequired))
  }
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        const account = writeWxAccount({
          wxNickName: nick,
          wxAvatarUrl: String(profile?.wxAvatarUrl || '').trim(),
          wxCode: res.code || '',
        })
        resolve(account)
      },
      fail: (e) => reject(e || new Error(getOauthLoginCopy().errLoginFailed)),
    })
  })
}

module.exports = {
  readWxAccount,
  isWxLoggedIn,
  writeWxAccount,
  clearWxAccount,
  completeWxLogin,
}
