/** 微信隐私保护指引（相册/相机/选文件 API 前置；修复安卓真机点击无反应） */
const mpRuntime = require('./mpRuntime.js')

const PRIVACY_AGREE_BTN_ID = 'mp-privacy-agree-btn'

function queryNeedAuthorization() {
  return new Promise((resolve) => {
    if (typeof wx.getPrivacySetting !== 'function') {
      resolve(false)
      return
    }
    wx.getPrivacySetting({
      success: (res) => resolve(!!(res && res.needAuthorization)),
      fail: () => resolve(false),
    })
  })
}

function openPrivacyContract(fallbackNavigate) {
  if (typeof wx.openPrivacyContract === 'function') {
    wx.openPrivacyContract({ fail: () => fallbackNavigate && fallbackNavigate() })
    return
  }
  if (fallbackNavigate) fallbackNavigate()
}

function registerAppPrivacyHandler(app) {
  if (typeof wx.onNeedPrivacyAuthorization !== 'function') return
  wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const page = pages.length ? pages[pages.length - 1] : null
    if (page && typeof page._handleNeedPrivacyAuthorization === 'function') {
      page._handleNeedPrivacyAuthorization(resolve, eventInfo)
      return
    }
    if (page) {
      page._privacyResolvePending = resolve
      if (typeof page.setData === 'function') {
        page.setData({ showMpPrivacyGate: true })
      }
    }
    if (app && app.globalData) {
      app.globalData._privacyResolve = resolve
    }
    // 须由 mp-privacy-gate 的 agreePrivacyAuthorization 按钮 resolve，勿在此弹无效 modal
  })
}

function resolvePrivacyAuthorization(page, buttonId) {
  const resolve =
    (page && page._privacyResolve) ||
    (page && page._privacyResolvePending) ||
    null
  if (typeof resolve !== 'function') return false
  resolve({
    event: 'agree',
    buttonId: String(buttonId || PRIVACY_AGREE_BTN_ID).trim(),
  })
  if (page) {
    page._privacyResolve = null
    page._privacyResolvePending = null
  }
  return true
}

function ensurePrivacyAuthorizeForMedia() {
  return new Promise((resolve, reject) => {
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve()
      return
    }
    wx.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: (err) => {
        const msg = String((err && err.errMsg) || '')
        if (/cancel/i.test(msg)) {
          reject(new Error('cancel'))
          return
        }
        reject(new Error('需要同意《隐私保护指引》后才能上传'))
      },
    })
  })
}

function ensureScopeAuthorized(scope, modalTitle, modalContent) {
  return new Promise((resolve) => {
    if (typeof wx.getSetting !== 'function') {
      resolve(true)
      return
    }
    wx.getSetting({
      success(setting) {
        const st = setting.authSetting && setting.authSetting[scope]
        if (st === true) {
          resolve(true)
          return
        }
        if (st === false) {
          wx.showModal({
            title: modalTitle,
            content: modalContent,
            confirmText: '去设置',
            success(modal) {
              if (modal.confirm && typeof wx.openSetting === 'function') {
                wx.openSetting({
                  success(s) {
                    resolve(!!(s.authSetting && s.authSetting[scope]))
                  },
                  fail: () => resolve(false),
                })
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
            scope,
            success: () => resolve(true),
            fail: () => resolve(false),
          })
          return
        }
        resolve(true)
      },
      fail: () => resolve(true),
    })
  })
}

/**
 * 相册/相机：新版微信已弱化 scope.album / scope.camera，
 * wx.authorize 常失败但 chooseMedia 仍可正常选文件。
 * 仅当用户曾明确拒绝（authSetting === false）时引导去设置；未声明则直接放行。
 */
function ensureDeprecatedMediaScope(scope, modalTitle, modalContent) {
  return new Promise((resolve) => {
    if (typeof wx.getSetting !== 'function') {
      resolve(true)
      return
    }
    wx.getSetting({
      success(setting) {
        const st = setting.authSetting && setting.authSetting[scope]
        if (st === false) {
          wx.showModal({
            title: modalTitle,
            content: modalContent,
            confirmText: '去设置',
            success(modal) {
              if (modal.confirm && typeof wx.openSetting === 'function') {
                wx.openSetting({
                  success(s) {
                    resolve(!!(s.authSetting && s.authSetting[scope]))
                  },
                  fail: () => resolve(false),
                })
              } else {
                resolve(false)
              }
            },
            fail: () => resolve(false),
          })
          return
        }
        resolve(true)
      },
      fail: () => resolve(true),
    })
  })
}

function ensureAlbumPermission(purpose) {
  const hint = purpose || '上传图片或视频'
  return ensureDeprecatedMediaScope('scope.album', '需要相册权限', `请在设置中允许访问相册，以便${hint}`)
}

function ensureCameraPermission(purpose) {
  const hint = purpose || '拍照或拍摄素材'
  return ensureDeprecatedMediaScope('scope.camera', '需要相机权限', `请在设置中允许使用相机，以便${hint}`)
}

function prepareMediaPick(opts) {
  const options = opts && typeof opts === 'object' ? opts : {}
  const purpose = String(options.purpose || '上传素材')
  const sourceType = options.sourceType || ['album', 'camera']
  const usesCamera =
    !!options.needCamera ||
    (Array.isArray(sourceType) && sourceType.indexOf('camera') >= 0)
  const skipPrivacy = !!options.skipPrivacyCheck

  const privacyStep = skipPrivacy ? Promise.resolve() : ensurePrivacyAuthorizeForMedia()

  return privacyStep
    .then(() => ensureAlbumPermission(purpose))
    .then((albumOk) => {
      if (!albumOk) throw new Error('需要相册权限才能选择文件')
      if (!usesCamera) return true
      return ensureCameraPermission(purpose).then((camOk) => {
        if (!camOk) throw new Error('需要相机权限才能拍摄')
        return true
      })
    })
}

function prepareFilePick(opts) {
  const skipPrivacy = opts && opts.skipPrivacyCheck
  if (skipPrivacy) return Promise.resolve()
  return ensurePrivacyAuthorizeForMedia()
}

function pickMessageFiles(opts) {
  const options = opts || {}
  return prepareFilePick({ skipPrivacyCheck: options.skipPrivacyCheck }).then(
    () =>
      new Promise((resolve, reject) => {
        wx.chooseMessageFile({
          count: Math.min(9, Math.max(1, Number(options.count) || 1)),
          type: options.type || 'file',
          extension: options.extension,
          success: resolve,
          fail: (err) => {
            const msg = String((err && err.errMsg) || err || '')
            if (/cancel/i.test(msg)) {
              resolve(null)
              return
            }
            reject(new Error(msg || '未选择文件'))
          },
        })
      }),
  )
}

function mapPickMediaError(err) {
  const msg = String((err && err.errMsg) || err || '')
  if (/cancel/.test(msg)) return { cancel: true, message: msg }
  if (/chooseMedia:fail|chooseVideo:fail|chooseImage:fail/i.test(msg)) {
    return {
      cancel: false,
      message: '无法打开相册或相机，请检查微信相册/相机权限后重试',
    }
  }
  if (/privacy|隐私/.test(msg)) {
    return {
      cancel: false,
      message: '需要同意《隐私保护指引》后才能上传，请重新点击上传',
    }
  }
  if (/auth|deny|authorize/i.test(msg)) {
    return { cancel: false, message: '需要相册权限，请在设置中允许后重试' }
  }
  return { cancel: false, message: msg || '选择失败' }
}

/**
 * 统一 chooseMedia：隐私授权 + 相册/相机权限 + 安卓图片 fallback
 * @returns {Promise<object|null>} chooseMedia success 结果；用户取消为 null
 */
function runChooseMedia(chooseOptions, pickOpts) {
  const opts = chooseOptions || {}
  const extra = pickOpts || {}
  return prepareMediaPick({
    purpose: extra.purpose,
    sourceType: opts.sourceType,
    needCamera: extra.needCamera,
    skipPrivacyCheck: extra.skipPrivacyCheck,
  }).then(
    () =>
      new Promise((resolve, reject) => {
        wx.chooseMedia({
          ...opts,
          success: resolve,
          fail: (err) => {
            const mapped = mapPickMediaError(err)
            if (mapped.cancel) {
              resolve(null)
              return
            }
            const isImageOnly =
              Array.isArray(opts.mediaType) &&
              opts.mediaType.indexOf('video') < 0 &&
              opts.mediaType.length > 0
            if (
              extra.androidImageFallback !== false &&
              isImageOnly &&
              mpRuntime.isAndroidWechat() &&
              typeof wx.chooseImage === 'function'
            ) {
              wx.chooseImage({
                count: Math.min(9, Math.max(1, Number(opts.count) || 1)),
                sourceType: opts.sourceType || ['album', 'camera'],
                success(res) {
                  const paths = res.tempFilePaths || []
                  if (!paths.length) {
                    reject(new Error('未选择图片'))
                    return
                  }
                  resolve({
                    tempFiles: paths.map((p) => ({ tempFilePath: p, size: 0 })),
                  })
                },
                fail(e2) {
                  const m2 = mapPickMediaError(e2)
                  reject(new Error(m2.message || mapped.message))
                },
              })
              return
            }
            reject(new Error(mapped.message))
          },
        })
      }),
  )
}

module.exports = {
  PRIVACY_AGREE_BTN_ID,
  queryNeedAuthorization,
  openPrivacyContract,
  registerAppPrivacyHandler,
  resolvePrivacyAuthorization,
  ensurePrivacyAuthorizeForMedia,
  ensureAlbumPermission,
  ensureCameraPermission,
  prepareMediaPick,
  prepareFilePick,
  pickMessageFiles,
  mapPickMediaError,
  runChooseMedia,
}
