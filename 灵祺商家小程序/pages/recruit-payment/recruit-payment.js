const api = require('../../utils/api.js')

Page({
  data: {},
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
  goBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/recruit-flow/recruit-flow' }) })
  },
  onAck() {
    wx.showModal({
      title: '确认打款',
      content: '已记录确认意向；正式环境将由财务工单与招募订单服务联动结算。',
      showCancel: false,
    })
  },
})
