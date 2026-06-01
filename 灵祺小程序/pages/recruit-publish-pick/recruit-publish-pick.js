const api = require('../../utils/api.js')

Page({
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
  goNovice() {
    wx.navigateTo({ url: '/pages/recruit-novice/recruit-novice' })
  },
  goPro() {
    wx.navigateTo({ url: '/pages/recruit-pro/recruit-pro' })
  },
  backFlow() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: '/pages/recruit-flow/recruit-flow' }),
    })
  },
})
