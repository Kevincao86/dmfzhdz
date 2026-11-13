const videoUpload = require('./recruitmentVideoUpload.js')
const recruitCoverImage = require('./recruitCoverImage.js')

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve(String(res.data || '').replace(/\s/g, '')),
      fail: (e) => reject(new Error((e && e.errMsg) || '读取文件失败')),
    })
  })
}

/** 与发招募「上传图片」同源 */
function chooseImage() {
  return recruitCoverImage.chooseCoverImageFile().then(async (picked) => {
    const pure = await readFileBase64(picked.path)
    return { path: picked.path, pureBase64: pure }
  })
}

/** 与「我的报名 → 回传视频」同源 */
function chooseVideo() {
  return videoUpload.chooseVideoFile().then((picked) => {
    if (!picked) throw new Error('cancel')
    return {
      path: picked.tempPath,
      thumb: String(picked.thumbTempFilePath || '').trim(),
    }
  })
}

/** AI 混剪：一次最多选多条视频（相册） */
function chooseVideos(maxCount) {
  const count = Math.min(9, Math.max(1, Number(maxCount) || 9))
  const privacy = require('./mpPrivacyAuthorize.js')
  return privacy.ensurePrivacyAuthorizeForMedia().then(
    () =>
      new Promise((resolve, reject) => {
        wx.chooseMedia({
          count,
          mediaType: ['video'],
          sourceType: ['album', 'camera'],
          maxDuration: 60,
          success(res) {
            const files = (res.tempFiles || [])
              .filter((f) => f && f.tempFilePath)
              .map((f) => ({
                path: f.tempFilePath,
                thumb: String(f.thumbTempFilePath || '').trim(),
                sizeBytes: Number(f.size) || 0,
                durationSec: Number(f.duration) || 0,
              }))
            if (!files.length) {
              reject(new Error('cancel'))
              return
            }
            resolve(files)
          },
          fail(err) {
            const msg = String((err && err.errMsg) || err || '')
            if (/cancel|取消/i.test(msg)) reject(new Error('cancel'))
            else reject(new Error(msg || '选择视频失败'))
          },
        })
      }),
  )
}

function chooseAndUploadRecruitVideo(mpOrderId, applicantId) {
  return videoUpload.chooseAndUploadVideo(mpOrderId, applicantId)
}

function downloadUrlBase64(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: async (res) => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          reject(new Error('下载失败'))
          return
        }
        try {
          const pure = await readFileBase64(res.tempFilePath)
          resolve(pure)
        } catch (e) {
          reject(e)
        }
      },
      fail: (e) => reject(new Error((e && e.errMsg) || '下载失败')),
    })
  })
}

function ensureWritePhotosPermission() {
  return new Promise((resolve) => {
    if (typeof wx.getSetting !== 'function') {
      resolve(true)
      return
    }
    wx.getSetting({
      success(setting) {
        const w = setting.authSetting && setting.authSetting['scope.writePhotosAlbum']
        if (w === true) {
          resolve(true)
          return
        }
        if (w === false) {
          wx.showModal({
            title: '需要相册写入权限',
            content: '保存视频到相册需授权，请在设置中开启',
            confirmText: '去设置',
            success(modal) {
              if (modal.confirm && typeof wx.openSetting === 'function') {
                wx.openSetting({ complete: () => resolve(false) })
              } else resolve(false)
            },
            fail: () => resolve(false),
          })
          return
        }
        if (typeof wx.authorize === 'function') {
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => resolve(true),
            fail: () => resolve(true),
          })
          return
        }
        resolve(true)
      },
      fail: () => resolve(true),
    })
  })
}

function saveVideoToAlbum(url) {
  return ensureWritePhotosPermission().then((ok) => {
    if (!ok) throw new Error('需要相册写入权限')
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode !== 200 || !res.tempFilePath) {
            reject(new Error('下载视频失败'))
            return
          }
          wx.saveVideoToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => resolve(),
            fail: (e) => reject(new Error((e && e.errMsg) || '保存相册失败')),
          })
        },
        fail: (e) => reject(new Error((e && e.errMsg) || '下载失败')),
      })
    })
  })
}

function writeBase64TempFile(base64, ext) {
  const fs = wx.getFileSystemManager()
  const safeExt = String(ext || 'bin').replace(/^\./, '')
  const path = `${wx.env.USER_DATA_PATH}/mp-addon-${Date.now()}.${safeExt}`
  fs.writeFileSync(path, String(base64 || '').replace(/\s/g, ''), 'base64')
  return path
}

function playAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    const ctx = wx.createInnerAudioContext()
    ctx.src = filePath
    ctx.onEnded(() => {
      ctx.destroy()
      resolve()
    })
    ctx.onError((e) => {
      ctx.destroy()
      reject(new Error((e && e.errMsg) || '播放失败'))
    })
    ctx.play()
  })
}

function playAudioBase64(base64, ext) {
  const path = writeBase64TempFile(base64, ext || 'mp3')
  return playAudioFile(path)
}

module.exports = {
  readFileBase64,
  chooseImage,
  chooseVideo,
  chooseVideos,
  chooseAndUploadRecruitVideo,
  downloadUrlBase64,
  saveVideoToAlbum,
  writeBase64TempFile,
  playAudioFile,
  playAudioBase64,
}
