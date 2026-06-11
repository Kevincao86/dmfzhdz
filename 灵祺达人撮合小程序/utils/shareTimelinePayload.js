/** 朋友圈分享 payload（同步返回，真机 open-type=shareTimeline 勿用 promise） */
const mpShare = require('./mpShare.js')
const recruitCoverLib = require('./recruitCoverLibrary.js')
const recruitShareCover = require('./recruitShareCover.js')

function buildTimelineSharePayload(opts) {
  const id = String((opts && opts.id) || '').trim()
  const title = String((opts && opts.title) || '').trim()
  const shareCoverPath = String((opts && opts.shareCoverPath) || '').trim()
  const mp = opts && opts.mp

  if (!id) return mpShare.defaultTimelineShare()

  const base = {
    title: title || mpShare.DEFAULT_TITLE,
    query: `id=${encodeURIComponent(id)}`,
  }

  if (recruitShareCover.isLocalSharePath(shareCoverPath)) {
    return { ...base, imageUrl: shareCoverPath }
  }

  if (mp) {
    const coverUrl = recruitCoverLib.resolveOrderCoverUrl(mp)
    const cached = recruitShareCover.readCached(coverUrl)
    if (cached) return { ...base, imageUrl: cached }
  }

  const fallback = mpShare.LOCAL_SHARE_COVER || mpShare.SHARE_COVER_IMAGE
  if (fallback) return { ...base, imageUrl: fallback }
  return base
}

module.exports = {
  buildTimelineSharePayload,
}
