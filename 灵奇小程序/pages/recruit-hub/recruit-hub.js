const api = require('../../utils/api.js')

Page({
  data: {},
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
})
