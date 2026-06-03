Page({
  data: {
    faqs: [
      { q: '如何微信登录？', a: '在「我的」页点击「微信登录」，选择头像并填写昵称后确认；达人注册与 PR 资料共用该账号。' },
      { q: '如何切换达人/PR 身份？', a: '在「我的」页用户名旁点击身份按钮，在弹窗中选择达人或 PR，一号双身份。' },
      { q: 'PR 信息如何填写？', a: '在「我的 PR 信息」选择公司（机构）或个人，用省/市筛选选择所在地并保存。' },
      { q: '如何发布招募？', a: '切换为 PR 身份后，在底部「发招募」选择大厅与模版填写发布。' },
      { q: '云剪任务如何接单？', a: '在首页「云剪任务」进入详情，报名后确认接收并回传抖音链接。' },
    ],
  },
  onContact() {
    const relay = require('../../utils/supportRelayMp.js')
    if (!relay.canSupport()) {
      wx.showModal({
        title: '联系客服',
        content:
          '请在 config.release.js 配置 MERCHANT_API_BASE_URL=https://mofangdianai.com/erp-api',
        showCancel: false,
      })
      return
    }
    wx.navigateTo({ url: '/pages/mine-support-chat/mine-support-chat' })
  },
})
