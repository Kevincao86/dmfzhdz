/** 朋友圈分享引导：微信真机不支持页面内 button 直调，仅胶囊菜单可用 */
const mpShare = require('./mpShare.js')
const shareCopy = require('./recruitmentShareCopy.js')
const userProfile = require('./userProfile.js')
const { buildTimelineSharePayload, buildFriendSharePayload } = require('./shareTimelinePayload.js')

function enableTimelineShareMenu() {
  mpShare.enableShareMenu()
  void mpShare.prepareShareCoverPath()
}

function copyRecruitShareText(mp) {
  if (!mp || !mp.id) return Promise.reject(new Error('missing_order'))
  return shareCopy.buildGroupCopyTextAsync(mp, userProfile.readPrProfile()).then(
    (text) =>
      new Promise((resolve, reject) => {
        wx.setClipboardData({
          data: text,
          success: () => resolve(text),
          fail: reject,
        })
      }),
  )
}

function showTimelineCapsuleGuide(title) {
  const name = String(title || '招募单').trim().slice(0, 24)
  wx.showModal({
    title: '分享到朋友圈',
    content:
      `「${name}」\n\n` +
      '招募文案已复制到剪贴板。\n' +
      '请点击右上角 ··· →「分享到朋友圈」。\n' +
      '小程序卡片会带上本招募单，文案可粘贴到朋友圈正文。',
    showCancel: false,
    confirmText: '我知道了',
  })
}

function openTimelineGuidePage(id, title) {
  const url =
    `/pages/share-timeline/share-timeline?id=${encodeURIComponent(id)}` +
    `&title=${encodeURIComponent(title || '')}`
  return new Promise((resolve, reject) => {
    wx.navigateTo({
      url,
      success: resolve,
      fail: reject,
    })
  })
}

/** 详情页：复制文案 + 弹窗引导；须留在详情页，胶囊分享才会打开 detail?id= */
function startTimelineShareFlow(opts) {
  const id = String((opts && opts.id) || '').trim()
  const title = String((opts && opts.title) || '').trim()
  const mp = opts && opts.mp
  if (!id) {
    wx.showToast({ title: '招募单未就绪', icon: 'none' })
    return Promise.resolve(false)
  }
  enableTimelineShareMenu()
  wx.showLoading({ title: '准备分享', mask: true })
  return copyRecruitShareText(mp || { id, title })
    .catch(() => null)
    .then(() => {
      wx.hideLoading()
      showTimelineCapsuleGuide(title)
      return true
    })
}

module.exports = {
  enableTimelineShareMenu,
  copyRecruitShareText,
  showTimelineCapsuleGuide,
  openTimelineGuidePage,
  startTimelineShareFlow,
  buildTimelineSharePayload,
  buildFriendSharePayload,
}
