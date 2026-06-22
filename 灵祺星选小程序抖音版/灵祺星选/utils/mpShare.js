/** 小程序默认分享（卡片封面 + 标题） */
const config = require('./config.js')
const mpRuntime = require('./mpRuntime.js')

/** 历史包内路径（已 pack ignore，仅作占位常量） */
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

function placeholderShareCoverUrl() {
  return remoteShareCoverUrl()
}

function defaultShareCoverSource() {
  return placeholderShareCoverUrl()
}

function prepareCoverFromSource(source) {
  const recruitShareCover = require('./recruitShareCover.js')
  const src = String(source || '').trim()
  if (!src) return Promise.resolve('')
  return new Promise((resolve) => {
    wx.getImageInfo({
      src,
      success(res) {
        const localSrc = res.path || src
        recruitShareCover
          .prepareShareImageUrl(localSrc)
          .then((path) => {
            const p = String(path || '').trim()
            if (p && recruitShareCover.isWechatLocalImagePath(p)) {
              resolve(persistCoverPath(p))
              return
            }
            if (recruitShareCover.isWechatLocalImagePath(localSrc)) {
              resolve(persistCoverPath(localSrc))
              return
            }
            resolve('')
          })
          .catch(() => {
            if (recruitShareCover.isWechatLocalImagePath(localSrc)) {
              resolve(persistCoverPath(localSrc))
            } else {
              resolve('')
            }
          })
      },
      fail(err) {
        console.warn('[mpShare] getImageInfo failed', src, err)
        resolve('')
      },
    })
  })
}

function prepareFromRemoteShareCover() {
  const remote = remoteShareCoverUrl()
  if (!remote) return Promise.resolve('')
  const recruitShareCover = require('./recruitShareCover.js')
  return recruitShareCover
    .prepareShareImageUrl(remote)
    .then((path) => {
      const p = String(path || '').trim()
      if (p && recruitShareCover.isWechatLocalImagePath(p)) return persistCoverPath(p)
      return prepareCoverFromSource(remote)
    })
    .catch(() => prepareCoverFromSource(remote))
}

/** 分享封面：CDN 下载后裁成 5:4；iOS 写 USER_DATA，安卓保留 wxfile 临时路径 */
function prepareShareCoverPath() {
  const existing = readCoverPath()
  if (existing) return Promise.resolve(existing)
  if (coverPreparePromise) return coverPreparePromise

  coverPreparePromise = prepareFromRemoteShareCover()
    .catch(() => '')
    .finally(() => {
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
  const remotePlaceholder = placeholderShareCoverUrl()

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
    return recruitShareCover.attachShareCoverPromise(shareBase, remotePlaceholder)
  }

  return {
    ...(forTimeline ? { title, query } : { title, path: sharePath }),
    imageUrl: remotePlaceholder,
    promise: prepareShareCoverPath().then((imageUrl) => {
      const url = String(imageUrl || remotePlaceholder).trim()
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
    const { isDouyinMp } = require('./mpPlatformUi.js')
    if (isDouyinMp()) {
      wx.showShareMenu({ menus: ['share'] })
      return
    }
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    })
  } catch (e) {
    console.warn('[mpShare] enableShareMenu', e && e.message ? e.message : e)
  }
}

function preloadShareCover() {
  void prepareShareCoverPath()
}

module.exports = {
  LOCAL_SHARE_COVER,
  SHARE_COVER_IMAGE: placeholderShareCoverUrl(),
  DEFAULT_TITLE,
  remoteShareCoverUrl,
  placeholderShareCoverUrl,
  prepareShareCoverPath,
  readCoverPath,
  defaultShare,
  defaultTimelineShare,
  enableShareMenu,
  preloadShareCover,
}
