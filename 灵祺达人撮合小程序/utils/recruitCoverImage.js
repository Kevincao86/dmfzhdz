const MAX_DATA_URL_LEN = 120000
const mpPrivacy = require('./mpPrivacyAuthorize.js')
const mpImageOss = require('./mpImageOssUpload.js')

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

function pickCoverImagePath(resolve, reject) {
  mpPrivacy
    .runChooseMedia(
      {
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      },
      { purpose: '上传封面图片' },
    )
    .then((res) => {
      if (!res) {
        reject(new Error('cancel'))
        return
      }
      const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
      if (!path) {
        reject(new Error('未选择图片'))
        return
      }
      wx.compressImage({
        src: path,
        quality: 72,
        compressedWidth: 750,
        success: (c) => resolve({ path: c.tempFilePath || path }),
        fail: () => resolve({ path }),
      })
    })
    .catch((e) => {
      const msg = String((e && e.message) || e || '')
      if (/cancel/i.test(msg)) reject(new Error('cancel'))
      else reject(new Error(msg || '选择图片失败'))
    })
}

/** 返回本地 temp 路径（发招募封面、云剪本地上传） */
function chooseCoverImageFile() {
  return new Promise((resolve, reject) => {
    pickCoverImagePath(resolve, reject)
  })
}

function chooseCoverImageDataUrl() {
  return chooseCoverImageFile().then((picked) => readPathAsDataUrl(picked.path, 0))
}

/** 选图并上传 OSS，返回 https URL（发单封面主路径） */
function chooseCoverImageOssUrl() {
  return chooseCoverImageFile().then((picked) =>
    mpImageOss.uploadImageFileToOss(picked.path, { purpose: 'cover', fileName: 'mp-recruit-cover.jpg' }),
  )
}

module.exports = {
  chooseCoverImageDataUrl,
  chooseCoverImageOssUrl,
  chooseCoverImageFile,
  readPathAsDataUrl,
  MAX_DATA_URL_LEN,
}
