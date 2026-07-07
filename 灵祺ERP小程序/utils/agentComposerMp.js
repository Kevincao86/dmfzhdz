/** 智能体输入栏 + 面板：与达人私聊 mpChatComposer 同源能力 */
const PLUS_ACTIONS = [
  { id: 'image', label: '照片', iconClass: 'plus-icon--photo' },
  { id: 'camera', label: '拍摄', iconClass: 'plus-icon--camera' },
  { id: 'location', label: '位置', iconClass: 'plus-icon--location' },
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
          thumbPath: '',
          contentType: 'image/jpeg',
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

module.exports = {
  PLUS_ACTIONS,
  chooseAlbumMedia,
  takePhoto,
  chooseLocation,
  chooseFile,
  syncShowSendBtn,
}
