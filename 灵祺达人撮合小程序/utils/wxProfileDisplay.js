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
  return false
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

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        resolve(String(res.data || ''))
      },
      fail(err) {
        reject(err || new Error('读取头像失败'))
      },
    })
  })
}

/** chooseAvatar 临时路径 → data URL，便于跨会话展示与同步云端 */
async function persistWxAvatarUrl(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (!isLocalTempAvatar(u)) return u
  try {
    const b64 = await readFileBase64(u)
    if (!b64) return u
    return `data:image/jpeg;base64,${b64}`
  } catch {
    try {
      const saved = await new Promise((resolve, reject) => {
        wx.saveFile({
          tempFilePath: u,
          success: (r) => resolve(String(r.savedFilePath || u)),
          fail: reject,
        })
      })
      return saved
    } catch {
      return u
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
  pickWxNick,
  pickWxAvatar,
  persistWxAvatarUrl,
  readWxProfileCache,
  writeWxProfileCache,
  clearWxProfileCache,
  resolveWxProfileForLogin,
}
