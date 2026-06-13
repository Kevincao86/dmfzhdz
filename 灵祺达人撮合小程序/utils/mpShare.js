/** 小程序默认分享（卡片封面 + 标题） */
const config = require('./config.js')

const LOCAL_SHARE_COVER = '/images/share/share-cover-ai-match.jpg'
const SHARE_COVER_FILE = 'share/share-cover-ai-match.jpg'
const DEFAULT_TITLE = '灵祺星选 · AI 智能匹配达人招募'

let cachedShareCoverPath = ''
let coverPreparePromise = null

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
  if (cachedShareCoverPath) return cachedShareCoverPath
  try {
    const app = getApp()
    const g = app && app.globalData && app.globalData.shareCoverPath
    if (g) {
      cachedShareCoverPath = String(g)
      return cachedShareCoverPath
    }
  } catch (_) {}
  return ''
}

function remoteShareCoverUrl() {
  const fromConfig = String(config.MP_SHARE_COVER_URL || '').trim()
  if (/^https?:\/\//i.test(fromConfig)) return fromConfig
  const cdn = String(config.RECRUIT_COVER_CDN_BASE || '').trim().replace(/\/$/, '')
  if (!/^https?:\/\//i.test(cdn)) return ''
  return `${cdn}/${SHARE_COVER_FILE}`
}

/** 分享封面：包内 JPG 裁成 5:4 后写入 USER_DATA_PATH，真机 imageUrl 铺满无黑边 */
function prepareShareCoverPath() {
  const existing = readCoverPath()
  if (
    existing &&
    (existing.indexOf('share-cover-ai-match-540') >= 0 ||
      existing.indexOf('share-cover-default-v') >= 0)
  ) {
    return Promise.resolve(existing)
  }
  if (coverPreparePromise) return coverPreparePromise

  const recruitShareCover = require('./recruitShareCover.js')

  coverPreparePromise = new Promise((resolve) => {
    const finishGetImageInfo = () => {
      wx.getImageInfo({
        src: LOCAL_SHARE_COVER,
        success(res) {
          const src = res.path || LOCAL_SHARE_COVER
          recruitShareCover
            .prepareShareImageUrl(src)
            .then((path) => resolve(persistCoverPath(path)))
            .catch(() => resolve(persistCoverPath(LOCAL_SHARE_COVER)))
        },
        fail(err) {
          console.warn('[mpShare] getImageInfo failed', err)
          const remote = remoteShareCoverUrl()
          if (!remote) {
            resolve(persistCoverPath(LOCAL_SHARE_COVER))
            return
          }
          recruitShareCover
            .prepareShareImageUrl(remote)
            .then((path) => resolve(persistCoverPath(path)))
            .catch(() => resolve(persistCoverPath(LOCAL_SHARE_COVER)))
        },
      })
    }

    const dest = `${wx.env.USER_DATA_PATH}/share-cover-default-v1/share-cover-ai-match-540.jpg`
    const fs = wx.getFileSystemManager()

    try {
      fs.accessSync(`${wx.env.USER_DATA_PATH}/share-cover-default-v1`)
    } catch {
      try {
        fs.mkdirSync(`${wx.env.USER_DATA_PATH}/share-cover-default-v1`, true)
      } catch (_) {}
    }

    fs.copyFile({
      srcPath: LOCAL_SHARE_COVER,
      destPath: dest,
      success() {
        recruitShareCover
          .prepareShareImageUrl(dest)
          .then((path) => resolve(persistCoverPath(path)))
          .catch(() => finishGetImageInfo())
      },
      fail(err) {
        console.warn('[mpShare] copyFile failed, fallback getImageInfo', err)
        finishGetImageInfo()
      },
    })
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

  const finish = (imageUrl) => {
    const url = String(imageUrl || readCoverPath() || LOCAL_SHARE_COVER).trim()
    return forTimeline ? { title, query, imageUrl: url } : { title, path: sharePath, imageUrl: url }
  }

  if (customImage) return finish(customImage)

  const ready = readCoverPath()
  if (ready) return finish(ready)

  return {
    ...(forTimeline ? { title, query } : { title, path: sharePath }),
    promise: prepareShareCoverPath().then((imageUrl) => finish(imageUrl)),
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
