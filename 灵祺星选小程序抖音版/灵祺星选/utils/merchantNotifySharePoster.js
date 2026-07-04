/**
 * 商家审核通知分享封面（750×1200 源图，转发前裁成微信卡片 5:4）
 * 静态文件：images/share/merchant-notify-*.png → CDN recruit-covers/share/
 */
const mpCdnAssets = require('./mpCdnAssets.js')

const TALENT_REVIEW_REL = 'share/merchant-notify-talent-review.png'
const CONTENT_REVIEW_REL = 'share/merchant-notify-content-review.png'

function talentReviewShareImageUrl() {
  return mpCdnAssets.merchantNotifyTalentReviewShare()
}

function contentReviewShareImageUrl() {
  return mpCdnAssets.merchantNotifyContentReviewShare()
}

function attachTalentReviewShare(shareBase) {
  const recruitShareCover = require('./recruitShareCover.js')
  return recruitShareCover.attachShareCoverPromise(shareBase, talentReviewShareImageUrl())
}

function attachContentReviewShare(shareBase) {
  const recruitShareCover = require('./recruitShareCover.js')
  return recruitShareCover.attachShareCoverPromise(shareBase, contentReviewShareImageUrl())
}

module.exports = {
  TALENT_REVIEW_REL,
  CONTENT_REVIEW_REL,
  talentReviewShareImageUrl,
  contentReviewShareImageUrl,
  attachTalentReviewShare,
  attachContentReviewShare,
}
