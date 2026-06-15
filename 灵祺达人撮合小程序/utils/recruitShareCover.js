/**
 * 招募单分享封面：微信卡片 5:4，竖/横版海报居中裁剪，禁止回退 https（否则上下黑边）
 */
const recruitCoverLib = require('./recruitCoverLibrary.js')
const mpRuntime = require('./mpRuntime.js')
const { joinUserDataPath, readUserDataPath } = require('./mpUserDataPath.js')

const SHARE_W = 500
const SHARE_H = 400
/** 缓存版本：裁剪算法升级后 bump，避免旧版非 5:4 图导致分享卡片上下黑边 */
const CACHE_DIR_NAME = 'recruit-share-cover-v4'

const memCache = Object.create(null)
const inflight = Object.create(null)

function androidMemKey(coverUrl) {
  return `android-temp:${String(coverUrl || '').trim()}`
}

function readAndroidShareTemp(coverUrl) {
  const key = String(coverUrl || '').trim()
  if (!key) return ''
  const cached = memCache[androidMemKey(key)]
  if (cached && isAndroidShareTempPath(cached)) return cached
  return ''
}

/** 安卓分享可用：包内路径或 wx.downloadFile / canvas 临时路径（非 USER_DATA） */
function isAndroidShareTempPath(p) {
  const s = String(p || '').trim()
  if (!s || /^https?:\/\//i.test(s)) return false
  if (isUserDataSharePath(s)) return false
  return true
}

function normalizeShareRemoteUrl(coverUrl) {
  const raw = String(coverUrl || '').trim()
  if (!raw) return ''
  const remapped = recruitCoverLib.remapStoredCoverUrl(raw)
  if (/^https?:\/\//i.test(remapped)) return remapped
  if (/^https?:\/\//i.test(raw)) return raw
  return remapped || raw
}

function cacheDir() {
  return joinUserDataPath(CACHE_DIR_NAME)
}

function hashStr(s) {
  const t = String(s || '')
  let h = 0
  for (let i = 0; i < t.length; i += 1) {
    h = ((h << 5) - h + t.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

function isLocalSharePath(p) {
  const s = String(p || '').trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return false
  return true
}

function isPackageLocalPath(p) {
  const s = String(p || '').trim()
  return s.startsWith('/') && !s.startsWith('//')
}

function isUserDataSharePath(p) {
  const s = String(p || '').trim()
  if (!s) return false
  if (isPackageLocalPath(s)) return false
  const root = readUserDataPath()
  if (root && s.indexOf(root) === 0) return true
  return /^wxfile:\/\/usr\//i.test(s) || /^http:\/\/usr\//i.test(s)
}

function ensureCacheDir() {
  const dir = cacheDir()
  if (!dir) return
  const fs = wx.getFileSystemManager()
  try {
    fs.accessSync(dir)
  } catch {
    try {
      fs.mkdirSync(dir, true)
    } catch (_) {
      /* ignore */
    }
  }
}

function cachePathFor(coverUrl) {
  const dir = cacheDir()
  if (!dir) return ''
  return `${dir}/${hashStr(coverUrl)}.jpg`
}

function readCached(coverUrl) {
  const key = String(coverUrl || '').trim()
  if (!key) return ''
  if (mpRuntime.isAndroidWechat()) {
    const android = readAndroidShareTemp(key)
    if (android) return android
    if (memCache[key] && isAndroidShareTempPath(memCache[key])) return memCache[key]
    return ''
  }
  if (!readUserDataPath()) return ''
  if (memCache[key] && isLocalSharePath(memCache[key])) return memCache[key]
  const path = cachePathFor(key)
  try {
    wx.getFileSystemManager().accessSync(path)
    memCache[key] = path
    return path
  } catch {
    return ''
  }
}

function writeDataUrlToTemp(dataUrl) {
  return new Promise((resolve, reject) => {
    const m = String(dataUrl || '').match(/^data:image\/(\w+);base64,(.+)$/i)
    if (!m) {
      reject(new Error('invalid_data_url'))
      return
    }
    const dest = joinUserDataPath(`share-cover-src-${Date.now()}.${m[1] === 'png' ? 'png' : 'jpg'}`)
    if (!dest) {
      reject(new Error('no_user_data_path'))
      return
    }
    wx.getFileSystemManager().writeFile({
      filePath: dest,
      data: m[2],
      encoding: 'base64',
      success: () => resolve(dest),
      fail: reject,
    })
  })
}

function ensureLocalImagePath(src) {
  const s = String(src || '').trim()
  if (!s) return Promise.reject(new Error('empty_src'))
  if (s.startsWith('data:image/')) return writeDataUrlToTemp(s)
  if (/^https?:\/\//i.test(s)) {
    const url = normalizeShareRemoteUrl(s) || s
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success(res) {
          if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
          else reject(new Error('download_failed'))
        },
        fail: reject,
      })
    }).catch((err) => {
      const local = recruitCoverLib.resolveLocalBundlePathFromUrl(s)
      if (!local) return Promise.reject(err)
      return new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: local,
          success(info) {
            resolve(info.path || local)
          },
          fail: reject,
        })
      })
    })
  }
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: s,
      success(info) {
        resolve(info.path || s)
      },
      fail: reject,
    })
  })
}

function exportCanvasToFile(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: SHARE_W,
      height: SHARE_H,
      destWidth: SHARE_W,
      destHeight: SHARE_H,
      fileType: 'jpg',
      quality: 0.9,
      success(res) {
        if (res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('empty_temp'))
      },
      fail(err) {
        if (mpRuntime.isAndroidWechat()) {
          reject(err)
          return
        }
        try {
          if (typeof canvas.toDataURL === 'function') {
            writeDataUrlToTemp(canvas.toDataURL('image/jpeg', 0.9)).then(resolve).catch(() => reject(err))
            return
          }
        } catch (_) {
          /* ignore */
        }
        reject(err)
      },
    })
  })
}

function cropToShareRatio(localPath) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: localPath,
      success(info) {
        const iw = info.width || 1
        const ih = info.height || 1
        let canvas
        try {
          canvas = wx.createOffscreenCanvas({ type: '2d', width: SHARE_W, height: SHARE_H })
        } catch (e) {
          reject(e)
          return
        }
        const ctx = canvas.getContext('2d')
        const img = canvas.createImage()
        img.onload = () => {
          // cover 铺满 5:4，避免微信分享卡片 letterbox 黑边
          const scale = Math.max(SHARE_W / iw, SHARE_H / ih)
          const dw = iw * scale
          const dh = ih * scale
          const dx = (SHARE_W - dw) / 2
          const dy = (SHARE_H - dh) / 2
          ctx.drawImage(img, dx, dy, dw, dh)
          exportCanvasToFile(canvas).then(resolve).catch(reject)
        }
        img.onerror = () => reject(new Error('image_load_failed'))
        img.src = info.path || localPath
      },
      fail: reject,
    })
  })
}

function persistCache(coverUrl, tempPath) {
  const key = String(coverUrl || '').trim()
  const p = String(tempPath || '').trim()
  if (mpRuntime.isAndroidWechat()) {
    if (p && isAndroidShareTempPath(p)) {
      memCache[key] = p
      memCache[androidMemKey(key)] = p
    }
    return Promise.resolve(p)
  }
  const dest = cachePathFor(key)
  if (!dest) {
    memCache[key] = p
    return Promise.resolve(p)
  }
  ensureCacheDir()
  return new Promise((resolve) => {
    wx.getFileSystemManager().copyFile({
      srcPath: p,
      destPath: dest,
      success: () => {
        memCache[key] = dest
        resolve(dest)
      },
      fail: () => {
        memCache[key] = p
        resolve(p)
      },
    })
  })
}

function fallbackDefaultCover() {
  const mpShare = require('./mpShare.js')
  return mpShare.prepareShareCoverPath().catch(() => mpShare.LOCAL_SHARE_COVER)
}

/** 将封面裁成 5:4 本地路径；招募单封面禁止回退首页默认图 */
function prepareShareImageUrl(coverUrl, opts) {
  const key = String(coverUrl || '').trim()
  const noDefaultFallback = !!(opts && opts.noDefaultFallback)
  if (!key) return noDefaultFallback ? Promise.resolve('') : fallbackDefaultCover()

  const cached = readCached(key)
  if (cached) return Promise.resolve(cached)

  if (inflight[key]) return inflight[key]

  inflight[key] = ensureLocalImagePath(key)
    .then((local) =>
      cropToShareRatio(local).catch((err) => {
        console.warn('[recruitShareCover] crop failed, use downloaded', err)
        return local
      }),
    )
    .then((temp) => persistCache(key, temp))
    .catch((err) => {
      console.warn('[recruitShareCover] prepare failed', err)
      if (noDefaultFallback) return ''
      return fallbackDefaultCover()
    })
    .finally(() => {
      delete inflight[key]
    })

  return inflight[key]
}

function remoteShareFallback(coverUrl) {
  const img = normalizeShareRemoteUrl(coverUrl)
  return /^https?:\/\//i.test(img) ? img : ''
}

function defaultPackageShareCover() {
  try {
    return require('./mpShare.js').LOCAL_SHARE_COVER
  } catch (_) {
    return '/images/share/share-cover-ai-match.jpg'
  }
}

function syncShareCoverFallback(coverUrl, remote) {
  const cached = readCached(coverUrl)
  if (cached) return cached
  if (mpRuntime.isAndroidWechat()) return defaultPackageShareCover()
  return remote || defaultPackageShareCover()
}

/** 构建分享 payload：双端同一裁剪逻辑；安卓 imageUrl 用 wxfile，iOS 用 USER_DATA */
function attachShareCoverPromise(shareBase, coverUrl) {
  const key = String(coverUrl || '').trim()
  if (!key) return shareBase

  const cached = readCached(key)
  if (cached) {
    return { ...shareBase, imageUrl: cached }
  }

  const remote = remoteShareFallback(key)
  const syncFallback = syncShareCoverFallback(key, remote)
  const syncImage = mpRuntime.isAndroidWechat() ? syncFallback : remote || syncFallback

  return {
    ...shareBase,
    imageUrl: syncImage,
    promise: prepareShareImageUrl(key, { noDefaultFallback: true }).then((imageUrl) => {
      const local = String(imageUrl || '').trim()
      const ok = mpRuntime.isAndroidWechat() ? isAndroidShareTempPath(local) : isLocalSharePath(local)
      if (ok) return { ...shareBase, imageUrl: local }
      if (!mpRuntime.isAndroidWechat() && remote) return { ...shareBase, imageUrl: remote }
      return { ...shareBase, imageUrl: syncFallback }
    }),
  }
}

function preloadShareImageUrl(coverUrl, opts) {
  const key = String(coverUrl || '').trim()
  if (!key) return Promise.resolve('')
  return prepareShareImageUrl(key, { noDefaultFallback: true, ...(opts || {}) }).then(() => readCached(key) || '')
}

module.exports = {
  SHARE_W,
  SHARE_H,
  readCached,
  readCachedForShare: readCached,
  isLocalSharePath,
  isUserDataSharePath,
  isAndroidShareTempPath,
  remoteShareFallback,
  resolveShareCardImageUrl: syncShareCoverFallback,
  prepareShareImageUrl,
  attachShareCoverPromise,
  preloadShareImageUrl,
}
