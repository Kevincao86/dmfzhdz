/** 小程序默认分享（卡片封面 + 标题） */
const config = require('./config.js')
const mpRuntime = require('./mpRuntime.js')

/** 历史包内路径（已 pack ignore，仅作占位常量） */
const LOCAL_SHARE_COVER = '/images/share/share-cover-ai-match.jpg'
const SHARE_COVER_FILE = 'share/share-cover-ai-match.jpg'
/** 微信聊天卡片会显示成「公众平台昵称｜title」，title 里不要再写小程序名 */
const APP_NICKNAME = '灵祺星选'
const DEFAULT_TITLE = 'AI按城市品类匹配商单'
const SHARE_CARD_SLOT = 'mp.share.card'

let cachedShareCoverPath = ''
let cachedShareCoverSource = ''
let coverPreparePromise = null
let decorShare = { title: '', imageUrl: '' }
let decorSharePromise = null

function usableDecorTitle(raw) {
  const title = String(raw || '').trim()
  if (!title || title === SHARE_CARD_SLOT || title === '达人小程序 · 分享卡片') return ''
  return title.slice(0, 32)
}

function applyDecorShare(item) {
  if (!item) return decorShare
  decorShare.title = usableDecorTitle(item.title)
  const imageUrl = String(item.imageUrl || '').trim()
  decorShare.imageUrl = /^https?:\/\//i.test(imageUrl) ? imageUrl : ''
  return decorShare
}

function ensureDecorShare() {
  if (decorSharePromise) return decorSharePromise
  decorSharePromise = require('./mpPlatformDecor.js')
    .fetchDecorItem(SHARE_CARD_SLOT)
    .then((item) => applyDecorShare(item))
    .catch(() => decorShare)
    .finally(() => {
      decorSharePromise = null
    })
  return decorSharePromise
}

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
  cachedShareCoverSource = remoteShareCoverUrl()
  try {
    const app = getApp()
    if (app && app.globalData) app.globalData.shareCoverPath = p
  } catch (_) {}
  return p
}

function readCoverPath() {
  const expected = remoteShareCoverUrl()
  if (cachedShareCoverSource && cachedShareCoverSource !== expected) {
    cachedShareCoverPath = ''
    cachedShareCoverSource = ''
  }
  if (cachedShareCoverPath && isCurrentShareCoverCache(cachedShareCoverPath)) {
    return cachedShareCoverPath
  }
  cachedShareCoverPath = ''
  try {
    const app = getApp()
    const g = app && app.globalData && app.globalData.shareCoverPath
    if (g && isCurrentShareCoverCache(g) && !decorShare.imageUrl) {
      cachedShareCoverPath = String(g)
      cachedShareCoverSource = expected
      return cachedShareCoverPath
    }
    if (app && app.globalData) app.globalData.shareCoverPath = ''
  } catch (_) {}
  return ''
}

function remoteShareCoverUrl() {
  const fromDecor = String(decorShare.imageUrl || '').trim()
  const fromConfig = fromDecor || String(config.MP_SHARE_COVER_URL || '').trim()
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

function titleForShareCard(raw) {
  const title = String(raw || '').trim()
  if (!title || title === APP_NICKNAME || title === '灵祺星选平台') return DEFAULT_TITLE
  const prefixed = title.match(/^灵祺星选\s*[|｜]\s*(.+)$/)
  if (prefixed && prefixed[1].trim()) return prefixed[1].trim()
  return title
}

function resolvedShareTitle(opts) {
  const custom = opts && opts.title ? String(opts.title).trim() : ''
  if (custom) return titleForShareCard(custom)
  return titleForShareCard(decorShare.title || DEFAULT_TITLE)
}

function buildSharePayload(path, opts, forTimeline) {
  const sharePath = path || '/pages/index/index'
  const query = opts && opts.query ? String(opts.query) : ''
  const customImage = opts && opts.imageUrl ? String(opts.imageUrl).trim() : ''
  const recruitShareCover = require('./recruitShareCover.js')
  const title = resolvedShareTitle(opts)
  const shareBase = forTimeline ? { title, query } : { title, path: sharePath }

  if (customImage) {
    return recruitShareCover.attachShareCoverPromise(shareBase, customImage)
  }

  const finish = (imageUrl) => {
    const nextTitle = resolvedShareTitle(opts)
    const url = String(imageUrl || remoteShareCoverUrl()).trim()
    return forTimeline
      ? { title: nextTitle, query, imageUrl: url }
      : { title: nextTitle, path: sharePath, imageUrl: url }
  }

  return {
    ...shareBase,
    imageUrl: readCoverPath() || remoteShareCoverUrl(),
    promise: ensureDecorShare()
      .then(() => prepareShareCoverPath())
      .then((imageUrl) => finish(imageUrl)),
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
  void ensureDecorShare().then(() => prepareShareCoverPath())
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
