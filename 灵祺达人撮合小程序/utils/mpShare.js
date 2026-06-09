/** 小程序默认分享（卡片封面 + 标题） */
const SHARE_COVER_IMAGE = '/images/share/share-cover-ai-match.jpg'
const DEFAULT_TITLE = '灵祺星选 · AI 智能匹配达人招募'

function defaultShare(path, opts) {
  const title = opts && opts.title ? String(opts.title).trim() : DEFAULT_TITLE
  return {
    title: title || DEFAULT_TITLE,
    path: path || '/pages/index/index',
    imageUrl: SHARE_COVER_IMAGE,
  }
}

function defaultTimelineShare(opts) {
  const title = opts && opts.title ? String(opts.title).trim() : DEFAULT_TITLE
  return {
    title: title || DEFAULT_TITLE,
    query: opts && opts.query ? String(opts.query) : '',
    imageUrl: SHARE_COVER_IMAGE,
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
  SHARE_COVER_IMAGE,
  DEFAULT_TITLE,
  defaultShare,
  defaultTimelineShare,
  enableShareMenu,
}
