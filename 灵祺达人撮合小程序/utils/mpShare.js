/** 小程序默认分享（卡片封面 + 标题） */
const config = require('./config.js')

const LOCAL_SHARE_COVER = '/images/share/share-cover-ai-match.jpg'
const DEFAULT_TITLE = '灵祺星选 · AI 智能匹配达人招募'

/** 仅当显式配置 MP_SHARE_COVER_URL 时用 HTTPS；勿自动拼 OSS（文件可能未上传 → 404 → 分享回退截图） */
function shareCoverImageUrl() {
  const fromConfig = String(config.MP_SHARE_COVER_URL || '').trim()
  if (/^https?:\/\//i.test(fromConfig)) return fromConfig
  return LOCAL_SHARE_COVER
}

function resolveCoverPath(src, done) {
  const url = String(src || '').trim() || LOCAL_SHARE_COVER
  if (/^https?:\/\//i.test(url)) {
    wx.downloadFile({
      url,
      success(res) {
        done(res.statusCode === 200 && res.tempFilePath ? res.tempFilePath : url)
      },
      fail() {
        done(url)
      },
    })
    return
  }
  wx.getImageInfo({
    src: url,
    success(res) {
      done(res.path || url)
    },
    fail() {
      done(url)
    },
  })
}

/** 微信 2.10+：promise resolve 后再出分享卡，避免 imageUrl 未就绪时回退为页面截图 */
function buildSharePayload(path, opts, forTimeline) {
  const title =
    opts && opts.title ? String(opts.title).trim() || DEFAULT_TITLE : DEFAULT_TITLE
  const sharePath = path || '/pages/index/index'
  const query = opts && opts.query ? String(opts.query) : ''
  const src = (opts && opts.imageUrl) || shareCoverImageUrl()

  const base = forTimeline ? { title, query } : { title, path: sharePath }

  return {
    ...base,
    promise: new Promise((resolve) => {
      resolveCoverPath(src, (imageUrl) => {
        resolve(forTimeline ? { title, query, imageUrl } : { title, path: sharePath, imageUrl })
      })
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

/** 页面 onLoad 时可预热（可选） */
function preloadShareCover() {
  resolveCoverPath(shareCoverImageUrl(), () => {})
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
