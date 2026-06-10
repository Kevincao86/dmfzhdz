const auth = require('./auth.js')
const wxAccount = require('./wxAccount.js')

function goLogin() {
  wx.reLaunch({ url: '/pages/login/login' })
}

function goWelcome() {
  wx.reLaunch({ url: '/pages/welcome/welcome' })
}

/** 切换账号：清除服务端会话与本机报名/通知缓存，回到开屏选身份 */
function switchAccount() {
  wx.showModal({
    title: '切换账号',
    content: '将退出当前灵祺账号；本机报名记录与消息通知缓存会清空，避免串到其他账号。',
    confirmText: '去选择身份',
    success(res) {
      if (!res.confirm) return
      auth.clearSession()
      goWelcome()
    },
  })
}

/** 退出登录：清除会话与微信展示信息，回到开屏选身份 */
function logout() {
  wx.showModal({
    title: '退出登录',
    content: '退出后将清除本机全部报名、资料与消息缓存，避免串到其他账号；需重新选择身份进入。',
    confirmText: '退出',
    confirmColor: '#dc2626',
    success(res) {
      if (!res.confirm) return
      auth.clearSession()
      wxAccount.clearWxAccount()
      goWelcome()
    },
  })
}

module.exports = {
  switchAccount,
  logout,
  goLogin,
  goWelcome,
}
