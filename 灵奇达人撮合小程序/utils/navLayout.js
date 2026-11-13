/** 按微信胶囊位置计算自定义顶栏留白（px → rpx） */
function applyCapsulePadding(page, styleKey = 'capsuleStyle', splitKeys = null) {
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menu = wx.getMenuButtonBoundingClientRect()
    const pxToRpx = 750 / win.windowWidth
    const menuTopRpx = Math.round(menu.top * pxToRpx)
    const capsuleRightRpx = Math.round((win.windowWidth - menu.left + 12) * pxToRpx)
    if (splitKeys) {
      const bandKey = splitKeys.band || splitKeys.top
      const bandVal = `padding-top:${menuTopRpx}rpx;`
      const rightVal = `padding-right:${capsuleRightRpx}rpx;`
      if (page.data[bandKey] === bandVal && page.data[splitKeys.right] === rightVal) return
      page.setData({
        [bandKey]: bandVal,
        [splitKeys.right]: rightVal,
      })
    } else {
      const combined = `padding-top:${menuTopRpx}rpx;padding-right:${capsuleRightRpx}rpx;`
      if (page.data[styleKey] === combined) return
      page.setData({
        [styleKey]: combined,
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
