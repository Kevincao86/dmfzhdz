const PLACEHOLDER_NICKS = new Set(['', '微信用户', '用户', '灵祺用户'])
const CACHE_KEY = 'meoo_wx_profile_cache_v1'

function isPlaceholderWxNick(name) {
  return PLACEHOLDER_NICKS.has(String(name || '').trim())
}

function isLocalTempAvatar(url) {
  const u = String(url || '').trim()
  if (!u) return true
  if (u.startsWith('wxfile://')) return true
  if (u.startsWith('http://tmp')) return true
  if (u.startsWith('http://usr/')) return true
  if (u.includes('/__tmp__/')) return true
  if (/^https?:\/\/127\.0\.0\.1(?::\d+)?\//i.test(u)) return true
  return false
}

/** 列表/聊天展示用：临时路径视为无头像，由 WXML 回退 logo */
function sanitizeDisplayAvatar(url) {
  const u = String(url || '').trim()
  if (!u || isLocalTempAvatar(u)) return ''
  return u
}

function pickWxNick(...values) {
  for (let i = 0; i < values.length; i++) {
    const s = String(values[i] || '').trim()
    if (s && !isPlaceholderWxNick(s)) return s
  }
  for (let i = 0; i < values.length; i++) {
    const s = String(values[i] || '').trim()
    if (s) return s
  }
  return ''
}

function pickWxAvatar(...values) {
  for (let i = 0; i < values.length; i++) {
    const s = String(values[i] || '').trim()
    if (s && !isLocalTempAvatar(s)) return s
  }
  for (let i = 0; i < values.length; i++) {
    const s = String(values[i] || '').trim()
    if (s) return s
  }
  return ''
}

/** chooseAvatar 临时路径 → OSS https（失败时再尝试本地保存，不再落 dataURL） */
async function persistWxAvatarUrl(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (!isLocalTempAvatar(u)) return u
  try {
    const mpImageOss = require('./mpImageOssUpload.js')
    return await mpImageOss.uploadImageFileToOss(u, {
      purpose: 'avatar',
      fileName: 'mp-wx-avatar.jpg',
    })
  } catch (e) {
    const msg = String((e && e.message) || e || '')
    try {
      const saved = await new Promise((resolve, reject) => {
        wx.saveFile({
          tempFilePath: u,
          success: (r) => resolve(String(r.savedFilePath || u)),
          fail: reject,
        })
      })
      if (msg) {
        console.warn('[wxProfileDisplay] avatar OSS failed, kept local file:', msg)
      }
      return saved
    } catch {
      throw new Error(msg || '头像上传失败，请重试')
    }
  }
}

function readWxProfileCache() {
  try {
    const raw = wx.getStorageSync(CACHE_KEY)
    if (!raw) return null
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    return o && typeof o === 'object' ? o : null
  } catch {
    return null
  }
}

function writeWxProfileCache(patch) {
  const prev = readWxProfileCache()
  const next = {
    wxNickName: pickWxNick(patch && patch.wxNickName, prev && prev.wxNickName),
    wxAvatarUrl: pickWxAvatar(patch && patch.wxAvatarUrl, prev && prev.wxAvatarUrl),
    updatedAt: Date.now(),
  }
  if (!next.wxNickName && !next.wxAvatarUrl) return next
  try {
    wx.setStorageSync(CACHE_KEY, JSON.stringify(next))
  } catch (_) {}
  return next
}

function clearWxProfileCache() {
  try {
    wx.removeStorageSync(CACHE_KEY)
  } catch (_) {}
}

async function applyWxProfileAfterLogin(nick, avatar) {
  const n = String(nick || '').trim()
  let av = String(avatar || '').trim()
  if (av) av = await persistWxAvatarUrl(av)
  if (n || av) writeWxProfileCache({ wxNickName: n, wxAvatarUrl: av })
  const auth = require('./auth.js')
  const wxAccount = require('./wxAccount.js')
  const accountMemberSync = require('./accountMemberSync.js')
  if ((n && !isPlaceholderWxNick(n)) || av) {
    try {
      await auth.updateWxProfile(n, av)
    } catch (_) {}
  }
  const acct = auth.readAccount()
  const finalNick = pickWxNick(n, acct && acct.wxNickName)
  const finalAv = pickWxAvatar(av, acct && acct.wxAvatarUrl)
  if (finalNick || finalAv) {
    wxAccount.writeWxAccount({ wxNickName: finalNick, wxAvatarUrl: finalAv })
  }
  if (acct) accountMemberSync.syncLocalProfilesFromAccount(acct)
  return { nick: finalNick, avatar: finalAv }
}

async function resolveWxProfileForLogin(wxLoginNick, wxLoginAvatar) {
  let nick = String(wxLoginNick || '').trim()
  let avatar = String(wxLoginAvatar || '').trim()
  if (isPlaceholderWxNick(nick) || !avatar) {
    try {
      const prof = await new Promise((resolve, reject) => {
        wx.getUserProfile({ desc: '用于灵祺账号展示', success: resolve, fail: reject })
      })
      const ui = prof && prof.userInfo
      if (ui && ui.nickName && isPlaceholderWxNick(nick)) nick = String(ui.nickName).trim()
      if (!avatar && ui && ui.avatarUrl) avatar = String(ui.avatarUrl).trim()
    } catch (_) {}
  }
  avatar = await persistWxAvatarUrl(avatar)
  return { nick, avatar }
}

module.exports = {
  isPlaceholderWxNick,
  isLocalTempAvatar,
  sanitizeDisplayAvatar,
  pickWxNick,
  pickWxAvatar,
  persistWxAvatarUrl,
  readWxProfileCache,
  writeWxProfileCache,
  clearWxProfileCache,
  resolveWxProfileForLogin,
  applyWxProfileAfterLogin,
}
