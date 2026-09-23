/** 商家 ERP 小程序默认分享：未自定义的页面可转发、可分享到朋友圈 */

const SHARE_TITLE = '灵祺经营管理助手'
const SHARE_PATH = '/pages/functions/functions'

function sharePayload() {
  return {
    title: SHARE_TITLE,
    path: SHARE_PATH,
  }
}

function defaultOnShareAppMessage() {
  return sharePayload()
}

function defaultOnShareTimeline() {
  return { title: SHARE_TITLE, query: '' }
}

function enableShareMenu() {
  try {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    })
  } catch (_) {}
}

function installDefaultShare() {
  if (installDefaultShare._done) return
  installDefaultShare._done = true
  const originPage = Page
  Page = function (opts) {
    const o = opts || {}
    if (typeof o.onShareAppMessage !== 'function') {
      o.onShareAppMessage = defaultOnShareAppMessage
    }
    if (typeof o.onShareTimeline !== 'function') {
      o.onShareTimeline = defaultOnShareTimeline
    }
    const prevShow = o.onShow
    o.onShow = function () {
      enableShareMenu()
      if (typeof prevShow === 'function') prevShow.apply(this, arguments)
    }
    return originPage(o)
  }
}

module.exports = {
  SHARE_TITLE,
  SHARE_PATH,
  sharePayload,
  installDefaultShare,
  enableShareMenu,
}
