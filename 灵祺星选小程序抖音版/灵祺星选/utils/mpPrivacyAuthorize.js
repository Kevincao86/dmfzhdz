/** 微信隐私保护指引（chooseAvatar / 相册等 API 前置） */

const PRIVACY_AGREE_BTN_ID = 'mp-privacy-agree-btn'

function queryNeedAuthorization() {
  return new Promise((resolve) => {
    if (typeof wx.getPrivacySetting !== 'function') {
      resolve(false)
      return
    }
    wx.getPrivacySetting({
      success: (res) => resolve(!!(res && res.needAuthorization)),
      fail: () => resolve(false),
    })
  })
}

function openPrivacyContract(fallbackNavigate) {
  if (typeof wx.openPrivacyContract === 'function') {
    wx.openPrivacyContract({ fail: () => fallbackNavigate && fallbackNavigate() })
    return
  }
  if (fallbackNavigate) fallbackNavigate()
}

function registerAppPrivacyHandler(app) {
  if (typeof wx.onNeedPrivacyAuthorization !== 'function') return
  wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const page = pages.length ? pages[pages.length - 1] : null
    if (page && typeof page._handleNeedPrivacyAuthorization === 'function') {
      page._handleNeedPrivacyAuthorization(resolve, eventInfo)
      return
    }
    if (app && app.globalData) {
      app.globalData._privacyResolve = resolve
    }
  })
}

function resolvePrivacyAuthorization(page, buttonId) {
  const resolve =
    (page && page._privacyResolve) ||
    (page && page._privacyResolvePending) ||
    null
  if (typeof resolve !== 'function') return false
  resolve({
    event: 'agree',
    buttonId: String(buttonId || PRIVACY_AGREE_BTN_ID).trim(),
  })
  if (page) {
    page._privacyResolve = null
    page._privacyResolvePending = null
  }
  return true
}

module.exports = {
  PRIVACY_AGREE_BTN_ID,
  queryNeedAuthorization,
  openPrivacyContract,
  registerAppPrivacyHandler,
  resolvePrivacyAuthorization,
}
