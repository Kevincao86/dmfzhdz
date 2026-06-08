const PLACEHOLDER_NICKS = new Set(['', '微信用户', '用户', '灵祺用户'])

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

module.exports = {
  isPlaceholderWxNick,
  isLocalTempAvatar,
  pickWxNick,
  pickWxAvatar,
  persistWxAvatarUrl,
}
