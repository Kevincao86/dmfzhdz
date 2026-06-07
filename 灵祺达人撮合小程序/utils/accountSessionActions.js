const auth = require('./auth.js')
const wxAccount = require('./wxAccount.js')

function goLogin() {
  wx.reLaunch({ url: '/pages/login/login' })
}

/** 切换账号：清除服务端会话与本机报名/通知缓存，前往登录页 */
function switchAccount() {
  wx.showModal({
    title: '切换账号',
    content: '将退出当前灵祺账号；本机报名记录与消息通知缓存会清空，避免串到其他账号。',
    confirmText: '去登录',
    success(res) {
      if (!res.confirm) return
      auth.clearSession()
      goLogin()
    },
  })
}

/** 退出登录：清除会话与微信展示信息，前往登录页 */
function logout() {
  wx.showModal({
    title: '退出登录',
    content: '退出后将清除本机全部报名、资料与消息缓存，避免串到其他账号；需重新登录。',
    confirmText: '退出',
    confirmColor: '#dc2626',
    success(res) {
      if (!res.confirm) return
      auth.clearSession()
      wxAccount.clearWxAccount()
      goLogin()
    },
  })
}

module.exports = {
  switchAccount,
  logout,
  goLogin,
}
