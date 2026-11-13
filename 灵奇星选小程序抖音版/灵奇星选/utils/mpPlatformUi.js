const config = require('./config.js')

/** 抖音星选小程序（与微信版 config.MP_PLATFORM 区分） */
function isDouyinMp() {
  return config.MP_PLATFORM === 'douyin'
}

/** 抖音使用系统导航栏 + 原生 tabBar，不做微信胶囊顶距 */
function usesNativeChrome() {
  return isDouyinMp()
}

/** 欢迎页固定浅紫顶栏（与 welcome-hero 一致；选身份后才切身份色） */
const WELCOME_NAV_BAR = '#9b87f5'

function applyWelcomeNavBar() {
  if (!isDouyinMp()) return
  try {
    if (typeof wx.setNavigationBarColor === 'function') {
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: WELCOME_NAV_BAR,
        animation: { duration: 0, timingFunc: 'linear' },
      })
    }
  } catch (e) {
    console.warn('[mp] welcome nav bar', e)
  }
}

module.exports = {
  isDouyinMp,
  usesNativeChrome,
  applyWelcomeNavBar,
  WELCOME_NAV_BAR,
}
