const mpOrderRegistryOps = require('./mpOrderRegistryOps.js')

const LOCAL_PREFIX = 'meoo_mp_group_qr_v1_'

function readLocalGroupQr(mpOrderId) {
  try {
    return String(wx.getStorageSync(`${LOCAL_PREFIX}${mpOrderId}`) || '').trim()
  } catch {
    return ''
  }
}

function writeLocalGroupQr(mpOrderId, dataUrl) {
  try {
    wx.setStorageSync(`${LOCAL_PREFIX}${mpOrderId}`, dataUrl || '')
  } catch (_) {}
}

function groupQrFromMp(mp) {
  if (!mp) return ''
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return (
    String(mp.groupQrImage || meta.groupQrImage || '').trim() || readLocalGroupQr(String(mp.id || ''))
  )
}

function patchGroupQrImage(mpOrderId, groupQrImage) {
  const id = String(mpOrderId || '').trim()
  if (!id) return Promise.reject(new Error('参数无效'))
  writeLocalGroupQr(id, groupQrImage)
  return mpOrderRegistryOps.patchGroupQrImage(id, groupQrImage)
}

function chooseAndReadImageDataUrl() {
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
          success: (c) => {
            const compressed = c.tempFilePath || path
            const fs = wx.getFileSystemManager()
            fs.readFile({
              filePath: compressed,
              encoding: 'base64',
              success: (r) => {
                const mime = /\.png$/i.test(compressed) ? 'image/png' : 'image/jpeg'
                const dataUrl = `data:${mime};base64,${r.data}`
                if (dataUrl.length > 900000) {
                  reject(new Error('图片过大，请换一张更小的二维码'))
                  return
                }
                resolve(dataUrl)
              },
              fail: () => reject(new Error('读取图片失败')),
            })
          },
          fail: () => reject(new Error('压缩图片失败')),
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
  readLocalGroupQr,
  writeLocalGroupQr,
  groupQrFromMp,
  patchGroupQrImage,
  chooseAndReadImageDataUrl,
}
