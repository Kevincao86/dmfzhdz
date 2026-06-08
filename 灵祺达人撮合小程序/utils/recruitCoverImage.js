const mpGroupQr = require('./mpGroupQr.js')

const MAX_DATA_URL_LEN = 120000

function readPathAsDataUrl(filePath, attempt) {
  const n = attempt || 0
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (r) => {
        const mime = /\.png$/i.test(filePath) ? 'image/png' : 'image/jpeg'
        const dataUrl = `data:${mime};base64,${r.data}`
        if (dataUrl.length <= MAX_DATA_URL_LEN) {
          resolve(dataUrl)
          return
        }
        if (n >= 4) {
          reject(new Error('封面图过大，请换一张更小的图片'))
          return
        }
        wx.compressImage({
          src: filePath,
          quality: Math.max(38, 72 - n * 10),
          compressedWidth: 720,
          success: (c) => {
            readPathAsDataUrl(c.tempFilePath || filePath, n + 1)
              .then(resolve)
              .catch(reject)
          },
          fail: () => reject(new Error('压缩图片失败')),
        })
      },
      fail: () => reject(new Error('读取图片失败')),
    })
  })
}

function chooseCoverImageDataUrl() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!path) {
          reject(new Error('未选择图片'))
          return
        }
        wx.compressImage({
          src: path,
          quality: 72,
          compressedWidth: 750,
          success: (c) => {
            readPathAsDataUrl(c.tempFilePath || path, 0).then(resolve).catch(reject)
          },
          fail: () => readPathAsDataUrl(path, 0).then(resolve).catch(reject),
        })
      },
      fail: (e) => {
        if (e && e.errMsg && /cancel/.test(e.errMsg)) reject(new Error('cancel'))
        else reject(new Error('选择图片失败'))
      },
    })
  })
}

module.exports = {
  chooseCoverImageDataUrl,
  readPathAsDataUrl,
  MAX_DATA_URL_LEN,
}
