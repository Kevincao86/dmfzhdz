/**
 * 招募单分享封面：微信卡片 5:4，竖/横版海报居中裁剪，禁止回退 https（否则上下黑边）
 */
const recruitCoverLib = require('./recruitCoverLibrary.js')
const mpShare = require('./mpShare.js')

const SHARE_W = 500
const SHARE_H = 400
const CACHE_DIR = `${wx.env.USER_DATA_PATH}/recruit-share-cover`

const memCache = Object.create(null)
const inflight = Object.create(null)

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

function ensureCacheDir() {
  const fs = wx.getFileSystemManager()
  try {
    fs.accessSync(CACHE_DIR)
  } catch {
    try {
      fs.mkdirSync(CACHE_DIR, true)
    } catch (_) {
      /* ignore */
    }
  }
}

function cachePathFor(coverUrl) {
  return `${CACHE_DIR}/${hashStr(coverUrl)}.jpg`
}

function readCached(coverUrl) {
  const key = String(coverUrl || '').trim()
  if (!key) return ''
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
    const dest = `${wx.env.USER_DATA_PATH}/share-cover-src-${Date.now()}.${m[1] === 'png' ? 'png' : 'jpg'}`
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
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: s,
        success(res) {
          if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
          else reject(new Error('download_failed'))
        },
        fail: reject,
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
        const targetRatio = SHARE_W / SHARE_H
        const srcRatio = iw / ih
        let sx = 0
        let sy = 0
        let sw = iw
        let sh = ih
        if (srcRatio > targetRatio) {
          sh = ih
          sw = ih * targetRatio
          sx = (iw - sw) / 2
          sy = 0
        } else {
          sw = iw
          sh = iw / targetRatio
          sx = 0
          sy = (ih - sh) / 2
        }

        let canvas
        try {
          canvas = wx.createOffscreenCanvas({ type: '2d', width: SHARE_W, height: SHARE_H })
        } catch (e) {
          reject(e)
          return
        }
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, SHARE_W, SHARE_H)
        const img = canvas.createImage()
        img.onload = () => {
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SHARE_W, SHARE_H)
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
  ensureCacheDir()
  const dest = cachePathFor(coverUrl)
  return new Promise((resolve) => {
    wx.getFileSystemManager().copyFile({
      srcPath: tempPath,
      destPath: dest,
      success: () => {
        memCache[coverUrl] = dest
        resolve(dest)
      },
      fail: () => {
        memCache[coverUrl] = tempPath
        resolve(tempPath)
      },
    })
  })
}

function fallbackDefaultCover() {
  return mpShare.prepareShareCoverPath().catch(() => mpShare.LOCAL_SHARE_COVER)
}

/** 将封面裁成 5:4 本地路径；失败时用包内默认分享图，不用 https 原图 */
function prepareShareImageUrl(coverUrl) {
  const key = String(coverUrl || '').trim()
  if (!key) return fallbackDefaultCover()

  const cached = readCached(key)
  if (cached) return Promise.resolve(cached)

  if (inflight[key]) return inflight[key]

  inflight[key] = ensureLocalImagePath(key)
    .then((local) => cropToShareRatio(local))
    .then((temp) => persistCache(key, temp))
    .catch((err) => {
      console.warn('[recruitShareCover] crop failed, use default cover', err)
      return fallbackDefaultCover()
    })
    .finally(() => {
      delete inflight[key]
    })

  return inflight[key]
}

/** 构建分享 payload：优先同步返回已缓存本地图，否则 promise 异步裁剪 */
function attachShareCoverPromise(shareBase, coverUrl) {
  const key = String(coverUrl || '').trim()
  if (!key) return shareBase

  const cached = readCached(key)
  if (cached) {
    return { ...shareBase, imageUrl: cached }
  }

  return {
    ...shareBase,
    promise: prepareShareImageUrl(key).then((imageUrl) => ({
      ...shareBase,
      imageUrl: isLocalSharePath(imageUrl) ? imageUrl : undefined,
    })),
  }
}

function preloadShareImageUrl(coverUrl) {
  return prepareShareImageUrl(coverUrl)
}

module.exports = {
  SHARE_W,
  SHARE_H,
  readCached,
  isLocalSharePath,
  prepareShareImageUrl,
  attachShareCoverPromise,
  preloadShareImageUrl,
}
