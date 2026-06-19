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

function chooseImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        try {
          const f = (res.tempFiles && res.tempFiles[0]) || null
          if (!f || !f.tempFilePath) {
            reject(new Error('未选择图片'))
            return
          }
          const pure = await readFileBase64(f.tempFilePath)
          resolve({ path: f.tempFilePath, pureBase64: pure })
        } catch (e) {
          reject(e)
        }
      },
      fail: (e) => reject(new Error((e && e.errMsg) || '选择图片取消')),
    })
  })
}

function chooseVideo() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      success: (res) => {
        const f = (res.tempFiles && res.tempFiles[0]) || null
        if (!f || !f.tempFilePath) {
          reject(new Error('未选择视频'))
          return
        }
        resolve({ path: f.tempFilePath, thumb: f.thumbTempFilePath || '' })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || '选择视频取消')),
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

function saveVideoToAlbum(url) {
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
