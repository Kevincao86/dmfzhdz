const groupChatApi = require('./mpOrderGroupChatApi.js')
const emojiMod = require('./mpChatEmoji.js')

const PLUS_ACTIONS = [
  { id: 'image', label: '照片', iconClass: 'plus-icon--photo' },
  { id: 'camera', label: '拍摄', iconClass: 'plus-icon--camera' },
  { id: 'location', label: '位置', iconClass: 'plus-icon--location' },
  { id: 'file', label: '文件', iconClass: 'plus-icon--file' },
]

function composerPanelData() {
  return {
    showPlusPanel: false,
    showEmojiPanel: false,
    showSendBtn: false,
    voiceMode: false,
    recordingVoice: false,
    emojiTab: 'default',
    chatEmojis: emojiMod.CHAT_EMOJIS,
    customEmojis: emojiMod.loadCustomEmojis(),
  }
}

function refreshCustomEmojis(page) {
  if (!page || !page.setData) return
  page.setData({ customEmojis: emojiMod.loadCustomEmojis() })
}

function onComposerInput(page, e) {
  const input = e && e.detail ? e.detail.value : ''
  page.setData({
    input,
    showSendBtn: String(input || '').trim().length > 0,
  })
}

function onTogglePlus(page) {
  if (!page.data.canSend) return
  const next = !page.data.showPlusPanel
  page.setData({ showPlusPanel: next, showEmojiPanel: false, voiceMode: false })
}

function onToggleEmoji(page) {
  if (!page.data.canSend) return
  const next = !page.data.showEmojiPanel
  page.setData({ showEmojiPanel: next, showPlusPanel: false, voiceMode: false })
}

function onToggleVoiceMode(page) {
  if (!page.data.canSend) return
  page.setData({
    voiceMode: !page.data.voiceMode,
    showPlusPanel: false,
    showEmojiPanel: false,
  })
}

function onPickDefaultEmoji(page, e) {
  const emoji = e && e.currentTarget ? e.currentTarget.dataset.emoji : ''
  if (!emoji) return
  const input = `${page.data.input || ''}${emoji}`
  page.setData({ input, showSendBtn: true })
}

function onEmojiTab(page, e) {
  const tab = e && e.currentTarget ? e.currentTarget.dataset.tab : 'default'
  page.setData({ emojiTab: tab === 'custom' ? 'custom' : 'default' })
}

async function onAddCustomEmojiAlbum(page) {
  try {
    const path = await emojiMod.chooseImageForEmoji()
    await emojiMod.addCustomEmojiFromPath(path)
    refreshCustomEmojis(page)
    page.setData({ emojiTab: 'custom' })
    wx.showToast({ title: '已添加', icon: 'success' })
  } catch (err) {
    if (String(err.message || err) !== 'cancel') {
      wx.showToast({ title: '添加失败', icon: 'none' })
    }
  }
}

function onLongPressCustomEmoji(page, e) {
  const id = e && e.currentTarget ? e.currentTarget.dataset.id : ''
  if (!id) return
  wx.showActionSheet({
    itemList: ['删除表情'],
    success: (res) => {
      if (res.tapIndex === 0) {
        emojiMod.removeCustomEmoji(id)
        refreshCustomEmojis(page)
      }
    },
  })
}

async function onCollectImageAsEmoji(page, url) {
  wx.showLoading({ title: '收藏中…', mask: true })
  try {
    await emojiMod.addCustomEmojiFromPath(url)
    refreshCustomEmojis(page)
    wx.showToast({ title: '已添加到表情', icon: 'success' })
  } catch (_) {
    wx.showToast({ title: '收藏失败', icon: 'none' })
  } finally {
    wx.hideLoading()
  }
}

function onImageLongPress(page, e) {
  const url = e && e.currentTarget ? e.currentTarget.dataset.url : ''
  if (!url) return
  wx.showActionSheet({
    itemList: ['添加到表情', '预览图片'],
    success: (res) => {
      if (res.tapIndex === 0) void onCollectImageAsEmoji(page, url)
      else if (res.tapIndex === 1) wx.previewImage({ urls: [url], current: url })
    },
  })
}

function guessContentType(filePath, fallback) {
  const p = String(filePath || '').toLowerCase()
  if (/\.mp4$/.test(p)) return 'video/mp4'
  if (/\.mp3$/.test(p)) return 'audio/mpeg'
  if (/\.png$/.test(p)) return 'image/png'
  if (/\.webp$/.test(p)) return 'image/webp'
  return fallback || 'application/octet-stream'
}

function uploadViaGroupChat(filePath, contentType, fileName) {
  return groupChatApi.uploadMedia(filePath, contentType, fileName)
}

function chooseAlbumImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) {
          reject(new Error('cancel'))
          return
        }
        resolve({ filePath: file.tempFilePath, contentType: 'image/jpeg', kind: 'image' })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
    })
  })
}

function takePhoto() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) {
          reject(new Error('cancel'))
          return
        }
        resolve({ filePath: file.tempFilePath, contentType: 'image/jpeg', kind: 'image' })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
    })
  })
}

function chooseLocation() {
  return new Promise((resolve, reject) => {
    wx.chooseLocation({
      success: (res) => {
        resolve({
          kind: 'location',
          latitude: res.latitude,
          longitude: res.longitude,
          locationName: String(res.name || res.address || '位置').trim(),
          text: String(res.address || res.name || '').trim(),
        })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
    })
  })
}

function chooseFile() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.path) {
          reject(new Error('cancel'))
          return
        }
        resolve({
          kind: 'file',
          filePath: file.path,
          fileName: file.name || '文件',
          contentType: guessContentType(file.path, file.type || 'application/octet-stream'),
        })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
    })
  })
}

function createRecorderManager(page) {
  const recorder = wx.getRecorderManager()
  recorder.onStop((res) => {
    if (page._voiceReject) {
      page._voiceReject = false
      return
    }
    const path = res.tempFilePath
    const durationSec = Math.max(1, Math.round((res.duration || 0) / 1000))
    if (path && typeof page.onVoiceRecorded === 'function') {
      page.onVoiceRecorded({ filePath: path, durationSec })
    }
  })
  recorder.onError(() => {
    wx.showToast({ title: '录音失败', icon: 'none' })
    if (page.setData) page.setData({ recordingVoice: false })
  })
  return recorder
}

function startVoiceRecord(page, recorder) {
  if (!recorder) return
  page._voiceReject = false
  page.setData({ recordingVoice: true })
  recorder.start({
    duration: 60000,
    format: 'mp3',
    sampleRate: 16000,
    numberOfChannels: 1,
  })
}

function stopVoiceRecord(page, recorder, cancel) {
  if (!recorder) return
  page._voiceReject = !!cancel
  page.setData({ recordingVoice: false })
  recorder.stop()
}

module.exports = {
  PLUS_ACTIONS,
  composerPanelData,
  refreshCustomEmojis,
  onComposerInput,
  onTogglePlus,
  onToggleEmoji,
  onToggleVoiceMode,
  onPickDefaultEmoji,
  onEmojiTab,
  onAddCustomEmojiAlbum,
  onLongPressCustomEmoji,
  onCollectImageAsEmoji,
  onImageLongPress,
  chooseAlbumImage,
  takePhoto,
  chooseLocation,
  chooseFile,
  uploadViaGroupChat,
  guessContentType,
  createRecorderManager,
  startVoiceRecord,
  stopVoiceRecord,
}
