const auth = require('./auth.js')
const wxAccount = require('./wxAccount.js')

function goLogin() {
  wx.reLaunch({ url: '/pages/login/login?switch=1' })
}

function goWelcome() {
  wx.reLaunch({ url: '/pages/welcome/welcome' })
}

/** 切换账号：清除会话与缓存，前往登录页换号 */
function switchAccount() {
  wx.showModal({
    title: '切换账号',
    content: '将退出当前灵祺账号并前往登录页，可使用微信或其他账号密码登录。',
    confirmText: '去登录',
    success(res) {
      if (!res.confirm) return
      auth.clearSession()
      wxAccount.clearWxAccount()
      goLogin()
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
