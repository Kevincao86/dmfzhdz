const groupChatApi = require('./mpOrderGroupChatApi.js')

const PLUS_ACTIONS = [
  { id: 'image', label: '照片', icon: '🖼' },
  { id: 'camera', label: '拍摄', icon: '📷' },
  { id: 'location', label: '位置', icon: '📍' },
  { id: 'file', label: '文件', icon: '📁' },
]

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
