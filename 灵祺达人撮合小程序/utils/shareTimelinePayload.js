/** 分享 payload：好友 5:4 封面；朋友圈 1:1（微信 onShareTimeline 规范） */
const mpShare = require('./mpShare.js')
const recruitCoverLib = require('./recruitCoverLibrary.js')
const recruitShareCover = require('./recruitShareCover.js')

/** 朋友圈封面用 1:1，避免 5:4 招募图导致真机静默失败 */
const TIMELINE_IMAGE = '/images/logo.png'

function buildTimelineSharePayload(opts) {
  const id = String((opts && opts.id) || '').trim()
  const title = String((opts && opts.title) || '').trim()

  if (!id) return mpShare.defaultTimelineShare()

  return {
    title: title || mpShare.DEFAULT_TITLE,
    query: `id=${encodeURIComponent(id)}`,
    imageUrl: TIMELINE_IMAGE,
  }
}

function buildFriendSharePayload(opts) {
  const id = String((opts && opts.id) || '').trim()
  const title = String((opts && opts.title) || '').trim()
  const shareCoverPath = String((opts && opts.shareCoverPath) || '').trim()
  const mp = opts && opts.mp

  if (!id) return mpShare.defaultShare('/pages/index/index')

  const share = {
    title: title || mpShare.DEFAULT_TITLE,
    path: `/pages/detail/detail?id=${encodeURIComponent(id)}`,
  }

  if (recruitShareCover.isLocalSharePath(shareCoverPath)) {
    return { ...share, imageUrl: shareCoverPath }
  }

  if (mp) {
    const coverUrl = recruitCoverLib.resolveOrderCoverUrl(mp)
    const cached = recruitShareCover.readCached(coverUrl)
    if (cached) return { ...share, imageUrl: cached }
    return recruitShareCover.attachShareCoverPromise(share, coverUrl)
  }

  const fallback = mpShare.LOCAL_SHARE_COVER || mpShare.SHARE_COVER_IMAGE
  if (fallback) return { ...share, imageUrl: fallback }
  return share
}

module.exports = {
  TIMELINE_IMAGE,
  buildTimelineSharePayload,
  buildFriendSharePayload,
}
