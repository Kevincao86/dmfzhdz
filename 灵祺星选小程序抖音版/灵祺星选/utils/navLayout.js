/** 按微信胶囊位置计算自定义顶栏留白（px → rpx） */
const { usesNativeChrome } = require('./mpPlatformUi.js')

const NATIVE_CHROME_TOP = 'padding-top:8rpx;'
const NATIVE_CHROME_RIGHT = 'padding-right:24rpx;'

function applyCapsulePadding(page, styleKey = 'capsuleStyle', splitKeys = null) {
  if (usesNativeChrome()) {
    if (splitKeys) {
      const bandKey = splitKeys.band || splitKeys.top
      page.setData({
        [bandKey]: NATIVE_CHROME_TOP,
        [splitKeys.right]: NATIVE_CHROME_RIGHT,
      })
    } else {
      page.setData({
        [styleKey]: NATIVE_CHROME_TOP + NATIVE_CHROME_RIGHT,
      })
    }
    return
  }
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menu = wx.getMenuButtonBoundingClientRect()
    const pxToRpx = 750 / win.windowWidth
    const menuTopRpx = Math.round(menu.top * pxToRpx)
    const capsuleRightRpx = Math.round((win.windowWidth - menu.left + 12) * pxToRpx)
    if (splitKeys) {
      const bandKey = splitKeys.band || splitKeys.top
      page.setData({
        [bandKey]: `padding-top:${menuTopRpx}rpx;`,
        [splitKeys.right]: `padding-right:${capsuleRightRpx}rpx;`,
      })
    } else {
      page.setData({
        [styleKey]: `padding-top:${menuTopRpx}rpx;padding-right:${capsuleRightRpx}rpx;`,
      })
    }
  } catch (_) {
    const fallback =
      'padding-top:calc(env(safe-area-inset-top) + 88rpx);padding-right:200rpx;'
    if (splitKeys) {
      const bandKey = splitKeys.band || splitKeys.top
      page.setData({
        [bandKey]: 'padding-top:calc(env(safe-area-inset-top) + 88rpx);',
        [splitKeys.right]: 'padding-right:200rpx;',
      })
    } else {
      page.setData({ [styleKey]: fallback })
    }
  }
}

module.exports = { applyCapsulePadding }
