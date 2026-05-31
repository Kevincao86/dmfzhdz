/** 资料保存成功后弹窗提示并返回上一页（无栈时回「我的」） */
function notifySavedAndBack(content) {
  try {
    const chat = require('./talentChat.js')
    if (chat.canChat()) void chat.syncProfile()
  } catch (_) {}
  const pages = getCurrentPages()
  wx.showModal({
    title: '已保存',
    content: content || '您的资料已保存。',
    showCancel: false,
    confirmText: '知道了',
    success() {
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 })
        return
      }
      wx.switchTab({ url: '/pages/mine/mine' })
    },
  })
}

module.exports = { notifySavedAndBack }
