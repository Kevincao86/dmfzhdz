const videoUpload = require('./recruitmentVideoUpload.js')

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

/** 与达人探店视频上传同源：复用 recruitmentVideoUpload.chooseVideoFile */
function chooseVideo() {
  return videoUpload.chooseVideoFile().then((picked) => {
    if (!picked) throw new Error('cancel')
    return {
      path: picked.tempPath,
      thumb: String(picked.thumbTempFilePath || '').trim(),
    }
  })
}

/** 与创建单模版封面一致：直接 chooseMedia，不做隐私降级 */
function chooseImage() {
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
        const finish = (filePath) => {
          readFileBase64(filePath)
            .then((pure) => resolve({ path: filePath, pureBase64: pure }))
            .catch(reject)
        }
        wx.compressImage({
          src: path,
          quality: 72,
          compressedWidth: 750,
          success: (c) => finish(c.tempFilePath || path),
          fail: () => finish(path),
        })
      },
      fail: (e) => {
        if (e && e.errMsg && /cancel/.test(e.errMsg)) reject(new Error('cancel'))
        else reject(new Error('选择图片失败'))
      },
    })
  })
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
  downloadUrlBase64,
  saveVideoToAlbum,
  writeBase64TempFile,
  playAudioFile,
  playAudioBase64,
}
