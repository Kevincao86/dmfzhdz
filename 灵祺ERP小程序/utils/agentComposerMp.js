/** 智能体输入栏：与网页 AiAgentComposerBar 对齐（语音 / 照片 / 视频 / 文件） */
const COMPOSER_TOOL_ACTIONS = [
  { id: 'voice', label: '语音' },
  { id: 'image', label: '照片' },
  { id: 'video', label: '视频' },
  { id: 'file', label: '文件' },
]

const PLUS_ACTIONS = [
  { id: 'image', label: '照片', iconClass: 'plus-icon--photo' },
  { id: 'camera', label: '拍摄', iconClass: 'plus-icon--camera' },
  { id: 'video', label: '视频', iconClass: 'plus-icon--video' },
  { id: 'file', label: '文件', iconClass: 'plus-icon--file' },
]

function guessContentType(filePath, fallback) {
  const p = String(filePath || '').toLowerCase()
  if (/\.mp4$/.test(p)) return 'video/mp4'
  if (/\.mov$/.test(p)) return 'video/quicktime'
  if (/\.png$/.test(p)) return 'image/png'
  if (/\.webp$/.test(p)) return 'image/webp'
  if (/\.pdf$/.test(p)) return 'application/pdf'
  return fallback || 'application/octet-stream'
}

function chooseAlbumMedia() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image', 'video'],
      sourceType: ['album'],
      maxDuration: 60,
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) {
          reject(new Error('cancel'))
          return
        }
        const isVideo = file.fileType === 'video' || /\.(mp4|mov|m4v)/i.test(file.tempFilePath || '')
        resolve({
          kind: isVideo ? 'video' : 'image',
          filePath: file.tempFilePath,
          thumbPath: file.thumbTempFilePath || '',
          contentType: isVideo ? 'video/mp4' : 'image/jpeg',
        })
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
        resolve({
          kind: 'image',
          filePath: file.tempFilePath,
          thumbPath: file.tempFilePath,
          contentType: 'image/jpeg',
          fileName: '拍摄',
        })
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
          locationName: String(res.name || res.address || '位置').trim(),
          text: String(res.address || res.name || '').trim(),
          latitude: res.latitude,
          longitude: res.longitude,
        })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
    })
  })
}

function chooseAlbumImages(count) {
  const n = Math.max(1, Math.min(9, Number(count) || 1))
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: n,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).filter((f) => f && f.tempFilePath)
        if (!files.length) {
          reject(new Error('cancel'))
          return
        }
        resolve(
          files.map((file) => ({
            kind: 'image',
            filePath: file.tempFilePath,
            thumbPath: file.thumbTempFilePath || file.tempFilePath,
            contentType: guessContentType(file.tempFilePath, 'image/jpeg'),
            fileName: String(file.tempFilePath || '').split('/').pop() || '照片',
          })),
        )
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
    })
  })
}

function chooseAlbumVideos(count) {
  const n = Math.max(1, Math.min(9, Number(count) || 1))
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: n,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      success: (res) => {
        const files = (res.tempFiles || []).filter((f) => f && f.tempFilePath)
        if (!files.length) {
          reject(new Error('cancel'))
          return
        }
        resolve(
          files.map((file) => ({
            kind: 'video',
            filePath: file.tempFilePath,
            thumbPath: file.thumbTempFilePath || '',
            contentType: 'video/mp4',
            fileName: String(file.tempFilePath || '').split('/').pop() || '视频',
          })),
        )
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

function syncShowSendBtn(page) {
  const input = String((page.data && page.data.input) || '').trim()
  const attachments = (page.data && page.data.attachments) || []
  page.setData({ showSendBtn: input.length > 0 || attachments.length > 0 })
}

function authorizeRecord() {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (s) => {
        if (s.authSetting && s.authSetting['scope.record']) {
          resolve(true)
          return
        }
        wx.authorize({
          scope: 'scope.record',
          success: () => resolve(true),
          fail: () => {
            wx.showModal({
              title: '需要麦克风权限',
              content: '语音输入需要麦克风权限，请在设置中开启。',
              confirmText: '去设置',
              success: (r) => {
                if (r.confirm) wx.openSetting({})
              },
            })
            resolve(false)
          },
        })
      },
      fail: () => resolve(false),
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
    if (path && typeof page.onVoiceRecorded === 'function') {
      page.onVoiceRecorded({ filePath: path, durationSec: Math.max(1, Math.round((res.duration || 0) / 1000)) })
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
  COMPOSER_TOOL_ACTIONS,
  PLUS_ACTIONS,
  chooseAlbumMedia,
  chooseAlbumImages,
  chooseAlbumVideos,
  takePhoto,
  chooseLocation,
  chooseFile,
  syncShowSendBtn,
  authorizeRecord,
  createRecorderManager,
  startVoiceRecord,
  stopVoiceRecord,
}
