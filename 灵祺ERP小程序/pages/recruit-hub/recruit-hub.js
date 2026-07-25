const api = require('../../utils/api.js')
const { assetUrl } = require('../../utils/mpStaticAssets.js')

Page({
  data: {
    logoSrc: assetUrl('logo.png'),
  },
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
})
