const { usesNativeChrome } = require('./mpPlatformUi.js')
const { formatMpApiErr } = require('./mpApiErrors.js')

function formatPickErr(e, fallback) {
  if (!e) return fallback
  if (typeof e === 'string') return e
  const raw = e.errMsg || e.message || e.errorMessage || e.errNo
  if (raw) {
    const s = String(raw)
      .replace(/^choose(?:Image|Media):fail\s*/i, '')
      .trim()
    if (s) return s
  }
  return formatMpApiErr(e, fallback)
}

function isUserCancel(msg) {
  return /cancel|取消|user deny|auth deny|未选择/i.test(String(msg || ''))
}

function extractImagePath(res) {
  if (!res) return ''
  const files = res.tempFiles
  if (Array.isArray(files) && files.length) {
    const f = files[0]
    const p = f && (f.tempFilePath || f.path || f.filePath)
    if (p) return String(p)
  }
  if (res.tempFilePaths && res.tempFilePaths[0]) return String(res.tempFilePaths[0])
  return ''
}

function ensurePrivacyAuthorized() {
  return new Promise((resolve) => {
    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({
        success: () => resolve(),
        fail: () => resolve(),
      })
      return
    }
    resolve()
  })
}

function runChooseImage(onSuccess, onFail) {
  wx.chooseImage({
    count: 1,
    sizeType: ['compressed', 'original'],
    sourceType: ['album', 'camera'],
    success: onSuccess,
    fail: onFail,
  })
}

function runChooseMedia(onSuccess, onFail) {
  wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
    sizeType: ['compressed'],
    success: onSuccess,
    fail: onFail,
  })
}

/** 抖音不支持微信 chooseAvatar 时，用相册/拍照选头像 */
function pickAvatarFromAlbum() {
  return ensurePrivacyAuthorized().then(() =>
    new Promise((resolve, reject) => {
      const onFail = (e) => {
        const msg = formatPickErr(e, '选择头像失败')
        if (/privacy permission|隐私|未授权|not authorized/i.test(msg)) {
          reject(
            new Error(
              '需同意隐私协议后才能选图：请先在抖音开放平台配置相册权限，并重试',
            ),
          )
          return
        }
        if (/devtools|模拟器|simulator/i.test(msg)) {
          reject(new Error('开发者工具可能不支持选图，请用真机调试'))
          return
        }
        reject(new Error(msg))
      }
      const onSuccess = (res) => {
        const path = extractImagePath(res)
        if (path) resolve(path)
        else reject(new Error('未获取到图片路径，请换一张重试'))
      }
      const tryImage = () => runChooseImage(onSuccess, onFail)
      if (typeof wx.chooseMedia === 'function') {
        runChooseMedia(onSuccess, (e) => {
          const msg = formatPickErr(e, '')
          if (msg && /not support|不支持|undefined|not exist/i.test(msg)) {
            tryImage()
            return
          }
          tryImage()
        })
        return
      }
      tryImage()
    }),
  )
}

function useAlbumAvatarPicker() {
  return usesNativeChrome()
}

module.exports = {
  pickAvatarFromAlbum,
  useAlbumAvatarPicker,
  formatPickErr,
  isUserCancel,
}
