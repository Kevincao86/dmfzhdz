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

function mapPickMediaError(err) {
  const msg = String((err && err.errMsg) || err || '')
  if (/cancel|取消/.test(msg)) return { cancel: true, message: msg }
  if (/privacy|pri\b|authorize|auth deny/i.test(msg)) {
    return { cancel: false, message: '需同意《隐私政策》并允许相册权限后才能上传' }
  }
  if (/chooseMedia:fail|chooseVideo:fail/i.test(msg)) {
    return { cancel: false, message: '无法打开相册，请检查微信相册权限后重试' }
  }
  return { cancel: false, message: msg || '选择失败' }
}

function ensurePrivacyAuthorize() {
  return new Promise((resolve, reject) => {
    const done = () => resolve(true)
    const fail = () => reject(new Error('需同意《隐私政策》后才能使用相册/拍摄上传'))
    if (typeof wx.getPrivacySetting === 'function') {
      wx.getPrivacySetting({
        success(res) {
          if (!res || !res.needAuthorization) {
            done()
            return
          }
          if (typeof wx.requirePrivacyAuthorize === 'function') {
            wx.requirePrivacyAuthorize({ success: done, fail })
            return
          }
          done()
        },
        fail: done,
      })
      return
    }
    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({ success: done, fail })
      return
    }
    done()
  })
}

function ensureAlbumPermission() {
  return new Promise((resolve) => {
    if (typeof wx.getSetting !== 'function') {
      resolve(true)
      return
    }
    wx.getSetting({
      success(setting) {
        const album = setting.authSetting && setting.authSetting['scope.album']
        if (album === true) {
          resolve(true)
          return
        }
        if (album === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许访问相册，以便上传云剪素材',
            confirmText: '去设置',
            success(modal) {
              if (modal.confirm && typeof wx.openSetting === 'function') {
                wx.openSetting({ complete: () => resolve(false) })
              } else {
                resolve(false)
              }
            },
            fail: () => resolve(false),
          })
          return
        }
        if (typeof wx.authorize === 'function') {
          wx.authorize({
            scope: 'scope.album',
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

function beforePickMedia() {
  return ensurePrivacyAuthorize().then(() => ensureAlbumPermission()).then((ok) => {
    if (!ok) throw new Error('需要相册权限才能上传')
  })
}

function chooseImage() {
  return beforePickMedia().then(
    () =>
      new Promise((resolve, reject) => {
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
          fail: (e) => {
            const mapped = mapPickMediaError(e)
            if (mapped.cancel) reject(new Error('cancel'))
            else reject(new Error(mapped.message))
          },
        })
      }),
  )
}

function pickVideoWithChooseMedia() {
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
      fail: (e) => {
        const mapped = mapPickMediaError(e)
        if (mapped.cancel) resolve(null)
        else reject(new Error(mapped.message))
      },
    })
  })
}

function pickVideoWithChooseVideo() {
  return new Promise((resolve, reject) => {
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: false,
      maxDuration: 60,
      success: (chooseRes) => {
        resolve({ path: chooseRes.tempFilePath, thumb: chooseRes.thumbTempFilePath || '' })
      },
      fail: (e) => {
        const mapped = mapPickMediaError(e)
        if (mapped.cancel) resolve(null)
        else reject(new Error(mapped.message))
      },
    })
  })
}

function chooseVideo() {
  return beforePickMedia()
    .then(() => pickVideoWithChooseMedia())
    .then((picked) => {
      if (picked) return picked
      return pickVideoWithChooseVideo()
    })
    .catch((firstErr) =>
      pickVideoWithChooseVideo().catch((secondErr) => {
        throw secondErr instanceof Error ? secondErr : firstErr instanceof Error ? firstErr : new Error('未选择视频')
      }),
    )
    .then((picked) => {
      if (!picked) throw new Error('cancel')
      return picked
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
  return ensurePrivacyAuthorize().then(
    () =>
      new Promise((resolve) => {
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
      }),
  )
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
