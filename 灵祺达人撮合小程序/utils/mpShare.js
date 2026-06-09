/** 小程序默认分享（卡片封面 + 标题） */
const config = require('./config.js')

const LOCAL_SHARE_COVER = '/images/share/share-cover-ai-match.jpg'
const DEFAULT_TITLE = '灵祺星选 · AI 智能匹配达人招募'

function ossShareCoverUrl() {
  try {
    const base = String(require('./recruitCoverOssBase.js') || '')
      .trim()
      .replace(/\/$/, '')
    if (!/^https?:\/\//i.test(base)) return ''
    return `${base}/share/share-cover-ai-match.jpg`
  } catch (_) {
    return ''
  }
}

/** 分享卡片 imageUrl：优先 config / OSS HTTPS，否则包内 JPG（须 packOptions.include） */
function shareCoverImageUrl() {
  const fromConfig = String(config.MP_SHARE_COVER_URL || '').trim()
  if (/^https?:\/\//i.test(fromConfig)) return fromConfig
  const oss = ossShareCoverUrl()
  if (oss) return oss
  return LOCAL_SHARE_COVER
}

function defaultShare(path, opts) {
  const title = opts && opts.title ? String(opts.title).trim() : DEFAULT_TITLE
  return {
    title: title || DEFAULT_TITLE,
    path: path || '/pages/index/index',
    imageUrl: shareCoverImageUrl(),
  }
}

function defaultTimelineShare(opts) {
  const title = opts && opts.title ? String(opts.title).trim() : DEFAULT_TITLE
  return {
    title: title || DEFAULT_TITLE,
    query: opts && opts.query ? String(opts.query) : '',
    imageUrl: shareCoverImageUrl(),
  }
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

module.exports = {
  LOCAL_SHARE_COVER,
  SHARE_COVER_IMAGE: LOCAL_SHARE_COVER,
  DEFAULT_TITLE,
  shareCoverImageUrl,
  defaultShare,
  defaultTimelineShare,
  enableShareMenu,
}
