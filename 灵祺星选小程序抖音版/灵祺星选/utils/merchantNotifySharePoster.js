/**
 * 商家审核通知分享封面（750×600，微信分享 5:4 原生尺寸）
 * - 面板预览：download 原图
 * - 转发卡片：prepareShareImageUrl 缩至 500×400（同比例无裁切）
 */
const mpCdnAssets = require('./mpCdnAssets.js')

const TALENT_REVIEW_REL = 'share/merchant-notify-talent-review.png'
const CONTENT_REVIEW_REL = 'share/merchant-notify-content-review.png'

function talentReviewCandidates() {
  return mpCdnAssets.merchantNotifyPosterCandidates(TALENT_REVIEW_REL)
}

function contentReviewCandidates() {
  return mpCdnAssets.merchantNotifyPosterCandidates(CONTENT_REVIEW_REL)
}

function talentReviewShareImageUrl() {
  return talentReviewCandidates()[0] || ''
}

function contentReviewShareImageUrl() {
  return contentReviewCandidates()[0] || ''
}

function tryWithCandidates(candidates, index, prepareFn) {
  const list = (candidates || []).map((u) => String(u || '').trim()).filter(Boolean)
  const i = index || 0
  if (i >= list.length) return Promise.resolve('')
  return prepareFn(list[i])
    .then((local) => {
      const p = String(local || '').trim()
      const recruitShareCover = require('./recruitShareCover.js')
      if (p && recruitShareCover.isWechatLocalImagePath(p)) return p
      return tryWithCandidates(list, i + 1, prepareFn)
    })
    .catch(() => tryWithCandidates(list, i + 1, prepareFn))
}

function tryDownloadFullPoster(candidates, index) {
  const recruitShareCover = require('./recruitShareCover.js')
  return tryWithCandidates(candidates, index, (url) => recruitShareCover.downloadShareImageUrl(url))
}

function tryPrepareSharePoster(candidates, index) {
  const recruitShareCover = require('./recruitShareCover.js')
  return tryWithCandidates(candidates, index, (url) =>
    recruitShareCover.prepareShareImageUrl(url, { noDefaultFallback: true }),
  )
}

function prepareTalentReviewPosterPreview() {
  return tryDownloadFullPoster(talentReviewCandidates(), 0)
}

function prepareContentReviewPosterPreview() {
  return tryDownloadFullPoster(contentReviewCandidates(), 0)
}

function attachShareWithCandidates(shareBase, candidates) {
  const list = (candidates || []).map((u) => String(u || '').trim()).filter(Boolean)
  if (!list.length) return shareBase
  const recruitShareCover = require('./recruitShareCover.js')
  const primary = list[0]
  const cached = recruitShareCover.readCached(primary)
  if (cached) {
    return { ...shareBase, imageUrl: cached }
  }
  return {
    title: shareBase.title,
    path: shareBase.path,
    promise: tryPrepareSharePoster(list, 0).then((imageUrl) => {
      if (imageUrl) return { ...shareBase, imageUrl }
      return shareBase
    }),
  }
}

function attachTalentReviewShare(shareBase) {
  return attachShareWithCandidates(shareBase, talentReviewCandidates())
}

function attachContentReviewShare(shareBase) {
  return attachShareWithCandidates(shareBase, contentReviewCandidates())
}

module.exports = {
  TALENT_REVIEW_REL,
  CONTENT_REVIEW_REL,
  talentReviewShareImageUrl,
  contentReviewShareImageUrl,
  talentReviewCandidates,
  contentReviewCandidates,
  prepareTalentReviewPosterPreview,
  prepareContentReviewPosterPreview,
  attachTalentReviewShare,
  attachContentReviewShare,
}
