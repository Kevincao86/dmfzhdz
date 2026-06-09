/** 小程序默认分享（卡片封面 + 标题） */
const config = require('./config.js')

const LOCAL_SHARE_COVER = '/images/share/share-cover-ai-match.jpg'
const SHARE_COVER_FILE = 'share/share-cover-ai-match.jpg'
const DEFAULT_TITLE = '灵祺星选 · AI 智能匹配达人招募'

let cachedShareCoverPath = ''

function cdnShareCoverUrl() {
  const cdn = String(config.RECRUIT_COVER_CDN_BASE || '').trim().replace(/\/$/, '')
  if (!/^https?:\/\//i.test(cdn)) return ''
  return `${cdn}/${SHARE_COVER_FILE}`
}

/** 分享封面：包内 JPG 优先（备案期远程 downloadFile 易失败）；远程仅作可选回退 */
function shareCoverImageUrl() {
  return LOCAL_SHARE_COVER
}

function remoteShareCoverUrl() {
  const fromConfig = String(config.MP_SHARE_COVER_URL || '').trim()
  if (/^https?:\/\//i.test(fromConfig)) return fromConfig
  return cdnShareCoverUrl()
}

function loadLocalCover(done) {
  wx.getImageInfo({
    src: LOCAL_SHARE_COVER,
    success(res) {
      const p = res.path || LOCAL_SHARE_COVER
      cachedShareCoverPath = p
      done(p)
    },
    fail(err) {
      console.warn('[mpShare] local cover getImageInfo failed', err)
      const remote = remoteShareCoverUrl()
      if (remote) {
        downloadRemoteCover(remote, () => done(LOCAL_SHARE_COVER))
        return
      }
      done(LOCAL_SHARE_COVER)
    },
  })
}

function downloadRemoteCover(url, onFail) {
  wx.downloadFile({
    url,
    success(res) {
      if (res.statusCode === 200 && res.tempFilePath) {
        cachedShareCoverPath = res.tempFilePath
        return
      }
      console.warn('[mpShare] download cover HTTP', res.statusCode, url)
      if (typeof onFail === 'function') onFail()
    },
    fail(err) {
      console.warn('[mpShare] download cover fail', url, err)
      if (typeof onFail === 'function') onFail()
    },
  })
}

function resolveCoverPath(src, done) {
  const url = String(src || '').trim() || LOCAL_SHARE_COVER
  if (!/^https?:\/\//i.test(url)) {
    loadLocalCover(done)
    return
  }
  wx.downloadFile({
    url,
    success(res) {
      if (res.statusCode === 200 && res.tempFilePath) {
        cachedShareCoverPath = res.tempFilePath
        done(res.tempFilePath)
        return
      }
      console.warn('[mpShare] download cover HTTP', res.statusCode, url)
      loadLocalCover(done)
    },
    fail(err) {
      console.warn('[mpShare] download cover fail', url, err)
      loadLocalCover(done)
    },
  })
}

function buildSharePayload(path, opts, forTimeline) {
  const title =
    opts && opts.title ? String(opts.title).trim() || DEFAULT_TITLE : DEFAULT_TITLE
  const sharePath = path || '/pages/index/index'
  const query = opts && opts.query ? String(opts.query) : ''
  const src = (opts && opts.imageUrl) || shareCoverImageUrl()

  const finish = (imageUrl) =>
    forTimeline ? { title, query, imageUrl } : { title, path: sharePath, imageUrl }

  if (cachedShareCoverPath) {
    return finish(cachedShareCoverPath)
  }

  return {
    ...(forTimeline ? { title, query } : { title, path: sharePath }),
    promise: new Promise((resolve) => {
      resolveCoverPath(src, (imageUrl) => resolve(finish(imageUrl)))
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
  if (cachedShareCoverPath) return
  loadLocalCover(() => {})
}

module.exports = {
  LOCAL_SHARE_COVER,
  SHARE_COVER_IMAGE: LOCAL_SHARE_COVER,
  DEFAULT_TITLE,
  shareCoverImageUrl,
  defaultShare,
  defaultTimelineShare,
  enableShareMenu,
  preloadShareCover,
}
