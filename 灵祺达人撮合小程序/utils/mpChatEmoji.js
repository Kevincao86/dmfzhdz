const STORAGE_KEY = 'meoo_chat_custom_emojis_v1'
const MAX_CUSTOM = 60
const mpPrivacy = require('./mpPrivacyAuthorize.js')

const CHAT_EMOJIS = [
  '😀', '😊', '🙂', '😂', '🥲', '👍', '👏', '🙏', '❤️', '✨',
  '🎉', '🔥', '💪', '🤝', '✅', '❓', '💬', '📷', '📎', '⭐',
]

function loadCustomEmojis() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    return Array.isArray(raw) ? raw : []
  } catch (_) {
    return []
  }
}

function saveCustomEmojis(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, (list || []).slice(0, MAX_CUSTOM))
  } catch (_) {
    /* ignore */
  }
}

function addCustomEmoji(url) {
  const u = String(url || '').trim()
  if (!u) return loadCustomEmojis()
  const list = loadCustomEmojis()
  if (list.some((item) => item.url === u)) return list
  const next = [{ id: `ce_${Date.now()}`, url: u, ts: Date.now() }, ...list].slice(0, MAX_CUSTOM)
  saveCustomEmojis(next)
  return next
}

function removeCustomEmoji(id) {
  const next = loadCustomEmojis().filter((item) => item.id !== id)
  saveCustomEmojis(next)
  return next
}

function persistEmojiPath(tempOrUrl) {
  return new Promise((resolve, reject) => {
    const src = String(tempOrUrl || '').trim()
    if (!src) {
      reject(new Error('empty'))
      return
    }
    const saveTemp = (tempFilePath) => {
      wx.saveFile({
        tempFilePath,
        success: (res) => resolve(res.savedFilePath || tempFilePath),
        fail: () => resolve(tempFilePath),
      })
    }
    if (/^https?:\/\//i.test(src)) {
      wx.downloadFile({
        url: src,
        success: (res) => {
          if (res.statusCode !== 200 || !res.tempFilePath) {
            reject(new Error('download fail'))
            return
          }
          saveTemp(res.tempFilePath)
        },
        fail: reject,
      })
      return
    }
    saveTemp(src)
  })
}

function addCustomEmojiFromPath(pathOrUrl) {
  return persistEmojiPath(pathOrUrl).then((saved) => addCustomEmoji(saved))
}

function chooseImageForEmoji() {
  return mpPrivacy
    .runChooseMedia(
      {
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'],
      },
      { purpose: '添加自定义表情' },
    )
    .then((res) => {
      if (!res) return Promise.reject(new Error('cancel'))
      const file = res.tempFiles && res.tempFiles[0]
      if (!file || !file.tempFilePath) return Promise.reject(new Error('cancel'))
      return file.tempFilePath
    })
}

module.exports = {
  CHAT_EMOJIS,
  loadCustomEmojis,
  addCustomEmoji,
  removeCustomEmoji,
  addCustomEmojiFromPath,
  chooseImageForEmoji,
}
