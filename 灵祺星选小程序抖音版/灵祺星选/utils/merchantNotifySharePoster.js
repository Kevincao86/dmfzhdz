/**
 * 商家审核通知分享封面（750×1200 源图，转发前裁成微信卡片 5:4）
 * 真机须走 mofangdianai.com CDN（微信合法域名）；OSS 仅备份。
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

function tryPrepareLocalPoster(candidates, index) {
  const recruitShareCover = require('./recruitShareCover.js')
  const list = (candidates || []).map((u) => String(u || '').trim()).filter(Boolean)
  const i = index || 0
  if (i >= list.length) return Promise.resolve('')
  return recruitShareCover
    .prepareShareImageUrl(list[i], { noDefaultFallback: true })
    .then((local) => {
      const p = String(local || '').trim()
      if (p && recruitShareCover.isWechatLocalImagePath(p)) return p
      return tryPrepareLocalPoster(list, i + 1)
    })
    .catch(() => tryPrepareLocalPoster(list, i + 1))
}

function prepareTalentReviewPosterPreview() {
  return tryPrepareLocalPoster(talentReviewCandidates(), 0)
}

function prepareContentReviewPosterPreview() {
  return tryPrepareLocalPoster(contentReviewCandidates(), 0)
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
    promise: tryPrepareLocalPoster(list, 0).then((imageUrl) => {
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
