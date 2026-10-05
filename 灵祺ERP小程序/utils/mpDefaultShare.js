/** 商家 ERP 小程序默认分享：未自定义的页面可转发、可分享到朋友圈 */

const config = require('./config.js')

const SHARE_TITLE = '灵祺经营管理助手'
const SHARE_PATH = '/pages/functions/functions'
const SHARE_IMAGE = '/images/share-cover.jpg'
const SHARE_CARD_SLOT = 'erp.mp.share.card'

let decorShare = { title: '', imageUrl: '' }
let decorSharePromise = null

function usableDecorTitle(raw) {
  const title = String(raw || '').trim()
  if (!title || title === SHARE_CARD_SLOT || title === '商家小程序 · 分享卡片') return ''
  return title.slice(0, 32)
}

function refreshDecorShare() {
  if (decorSharePromise) return decorSharePromise
  const base = String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  if (!base) return Promise.resolve(decorShare)
  decorSharePromise = new Promise((resolve) => {
    wx.request({
      url: `${base}/api/meoo-platform-decor-public?slotKey=${encodeURIComponent(SHARE_CARD_SLOT)}`,
      method: 'GET',
      timeout: 4000,
      success(res) {
        const item = res.data && res.data.item
        if (item && item.enabled !== false) {
          decorShare.title = usableDecorTitle(item.title)
          const imageUrl = String(item.imageUrl || '').trim()
          decorShare.imageUrl = /^https?:\/\//i.test(imageUrl) ? imageUrl : ''
        }
        resolve(decorShare)
      },
      fail() {
        resolve(decorShare)
      },
    })
  }).finally(() => {
    decorSharePromise = null
  })
  return decorSharePromise
}

function sharePayload() {
  const title = decorShare.title || SHARE_TITLE
  const imageUrl = decorShare.imageUrl || SHARE_IMAGE
  return {
    title,
    path: SHARE_PATH,
    imageUrl,
    promise: refreshDecorShare().then((next) => ({
      title: next.title || SHARE_TITLE,
      path: SHARE_PATH,
      imageUrl: next.imageUrl || SHARE_IMAGE,
    })),
  }
}

function defaultOnShareAppMessage() {
  return sharePayload()
}

function defaultOnShareTimeline() {
  const payload = sharePayload()
  return {
    title: payload.title,
    query: '',
    imageUrl: payload.imageUrl,
    promise: payload.promise.then((next) => ({
      title: next.title,
      query: '',
      imageUrl: next.imageUrl,
    })),
  }
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
  SHARE_IMAGE,
  sharePayload,
  installDefaultShare,
  enableShareMenu,
}
