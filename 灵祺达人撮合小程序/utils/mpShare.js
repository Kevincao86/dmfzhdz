/** 小程序默认分享（卡片封面 + 标题） */
const config = require('./config.js')
const mpRuntime = require('./mpRuntime.js')
const { joinUserDataPath, readUserDataPath } = require('./mpUserDataPath.js')

const LOCAL_SHARE_COVER = '/images/share/share-cover-ai-match.jpg'
const SHARE_COVER_FILE = 'share/share-cover-ai-match.jpg'
const DEFAULT_TITLE = '灵祺星选 · AI 智能匹配本地生活招募'

let cachedShareCoverPath = ''
let coverPreparePromise = null

function shareCoverCacheVer() {
  return String(config.MP_ASSET_CACHE_VER || '1').trim() || '1'
}

function shareCoverCacheDirName() {
  return `share-cover-default-${shareCoverCacheVer()}`
}

function isCurrentShareCoverCache(path) {
  const p = String(path || '').trim()
  if (!p) return false
  if (p.indexOf(shareCoverCacheDirName()) >= 0) return true
  if (mpRuntime.isAndroidWechat()) {
    try {
      return require('./recruitShareCover.js').isWechatLocalImagePath(p)
    } catch (_) {
      return false
    }
  }
  return false
}

function persistCoverPath(path) {
  const p = String(path || '').trim()
  if (!p) return ''
  cachedShareCoverPath = p
  try {
    const app = getApp()
    if (app && app.globalData) app.globalData.shareCoverPath = p
  } catch (_) {}
  return p
}

function readCoverPath() {
  if (cachedShareCoverPath && isCurrentShareCoverCache(cachedShareCoverPath)) {
    return cachedShareCoverPath
  }
  cachedShareCoverPath = ''
  try {
    const app = getApp()
    const g = app && app.globalData && app.globalData.shareCoverPath
    if (g && isCurrentShareCoverCache(g)) {
      cachedShareCoverPath = String(g)
      return cachedShareCoverPath
    }
    if (app && app.globalData) app.globalData.shareCoverPath = ''
  } catch (_) {}
  return ''
}

function remoteShareCoverUrl() {
  const fromConfig = String(config.MP_SHARE_COVER_URL || '').trim()
  const ver = shareCoverCacheVer()
  const withVer = (url) => {
    const u = String(url || '').trim()
    if (!/^https?:\/\//i.test(u)) return u
    if (/[?&]v=/.test(u)) return u
    return `${u}${u.includes('?') ? '&' : '?'}v=${ver}`
  }
  if (/^https?:\/\//i.test(fromConfig)) return withVer(fromConfig)
  const cdn = String(config.RECRUIT_COVER_CDN_BASE || '').trim().replace(/\/$/, '')
  if (!/^https?:\/\//i.test(cdn)) return ''
  return withVer(`${cdn}/${SHARE_COVER_FILE}`)
}

function defaultShareCoverSource() {
  return LOCAL_SHARE_COVER
}

function fallbackShareCoverSource() {
  if (config.MP_COVER_PREFER_CDN !== false) {
    const remote = remoteShareCoverUrl()
    if (remote) return remote
  }
  return LOCAL_SHARE_COVER
}

/** 分享封面：CDN/包内 JPG 裁成 5:4；iOS 写 USER_DATA，安卓保留 wxfile 临时路径 */
function prepareShareCoverPath() {
  const existing = readCoverPath()
  if (existing) return Promise.resolve(existing)
  if (coverPreparePromise) return coverPreparePromise

  const recruitShareCover = require('./recruitShareCover.js')

  if (mpRuntime.isAndroidWechat()) {
    const source = remoteShareCoverUrl()
    if (!source) return Promise.resolve('')
    coverPreparePromise = recruitShareCover
      .prepareShareImageUrl(source)
      .then((path) => {
        const p = String(path || '').trim()
        if (p && recruitShareCover.isWechatLocalImagePath(p)) return persistCoverPath(p)
        return ''
      })
      .catch(() => '')
      .finally(() => {
        coverPreparePromise = null
      })
    return coverPreparePromise
  }

  const root = readUserDataPath()
  if (!root) {
    return Promise.resolve(persistCoverPath(LOCAL_SHARE_COVER))
  }

  const source = defaultShareCoverSource()

  coverPreparePromise = new Promise((resolve) => {
    const finishPrepare = (src) => {
      wx.getImageInfo({
        src,
        success(res) {
          const localSrc = res.path || src
          recruitShareCover
            .prepareShareImageUrl(localSrc)
            .then((path) => resolve(persistCoverPath(path)))
            .catch(() => resolve(persistCoverPath(localSrc || LOCAL_SHARE_COVER)))
        },
        fail(err) {
          console.warn('[mpShare] getImageInfo failed', src, err)
          const fallback = fallbackShareCoverSource()
          if (src !== fallback && fallback !== LOCAL_SHARE_COVER) {
            finishPrepare(fallback)
            return
          }
          if (src !== LOCAL_SHARE_COVER) {
            finishPrepare(LOCAL_SHARE_COVER)
            return
          }
          resolve(persistCoverPath(LOCAL_SHARE_COVER))
        },
      })
    }

    const cacheDir = joinUserDataPath(shareCoverCacheDirName())
    const dest = joinUserDataPath(shareCoverCacheDirName(), 'share-cover-ai-match-src.jpg')
    const fs = wx.getFileSystemManager()

    if (source === LOCAL_SHARE_COVER && dest) {
      try {
        if (cacheDir) fs.accessSync(cacheDir)
      } catch {
        try {
          if (cacheDir) fs.mkdirSync(cacheDir, true)
        } catch (_) {}
      }
      fs.copyFile({
        srcPath: LOCAL_SHARE_COVER,
        destPath: dest,
        success() {
          finishPrepare(dest)
        },
        fail(err) {
          console.warn('[mpShare] copyFile failed, fallback getImageInfo', err)
          finishPrepare(LOCAL_SHARE_COVER)
        },
      })
      return
    }

    finishPrepare(source)
  }).finally(() => {
    coverPreparePromise = null
  })

  return coverPreparePromise
}

function buildSharePayload(path, opts, forTimeline) {
  const title =
    opts && opts.title ? String(opts.title).trim() || DEFAULT_TITLE : DEFAULT_TITLE
  const sharePath = path || '/pages/index/index'
  const query = opts && opts.query ? String(opts.query) : ''
  const customImage = opts && opts.imageUrl ? String(opts.imageUrl).trim() : ''
  const recruitShareCover = require('./recruitShareCover.js')
  const shareBase = forTimeline ? { title, query } : { title, path: sharePath }

  if (customImage) {
    return recruitShareCover.attachShareCoverPromise(shareBase, customImage)
  }

  const ready = readCoverPath()
  if (ready) {
    return forTimeline
      ? { title, query, imageUrl: ready }
      : { title, path: sharePath, imageUrl: ready }
  }

  if (mpRuntime.isAndroidWechat()) {
    const source = remoteShareCoverUrl()
    if (!source) return shareBase
    return recruitShareCover.attachShareCoverPromise(shareBase, source)
  }

  return {
    ...(forTimeline ? { title, query } : { title, path: sharePath }),
    imageUrl: LOCAL_SHARE_COVER,
    promise: prepareShareCoverPath().then((imageUrl) => {
      const url = String(imageUrl || LOCAL_SHARE_COVER).trim()
      return forTimeline ? { title, query, imageUrl: url } : { title, path: sharePath, imageUrl: url }
    }),
  }
}

function defaultShare(path, opts) {
  return buildSharePayload(path, opts, false)
}

function defaultTimelineShare(opts) {
  return buildSharePayload('/pages/index/index', opts, true)
}

function enableShareMenu() {
  if (typeof wx.showShareMenu !== 'function') return
  try {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    })
  } catch (_) {}
}

function preloadShareCover() {
  void prepareShareCoverPath()
}

module.exports = {
  LOCAL_SHARE_COVER,
  SHARE_COVER_IMAGE: LOCAL_SHARE_COVER,
  DEFAULT_TITLE,
  prepareShareCoverPath,
  readCoverPath,
  defaultShare,
  defaultTimelineShare,
  enableShareMenu,
  preloadShareCover,
}
