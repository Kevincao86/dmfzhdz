const auth = require('./auth.js')
const wxAccount = require('./wxAccount.js')

function goLogin() {
  wx.reLaunch({ url: '/pages/login/login' })
}

/** 切换账号：清除服务端会话，保留本机资料草稿，前往登录页 */
function switchAccount() {
  wx.showModal({
    title: '切换账号',
    content: '将退出当前灵祺账号，可使用其他登录名或微信重新登录。本机已填资料仍会保留。',
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
    content: '退出后需重新登录才能报名、私信与同步云端资料。',
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
