const mpAuth = require('../../utils/mpAccountAuth.js')
const wxAccount = require('../../utils/wxAccount.js')
const userProfile = require('../../utils/userProfile.js')

Page({
  data: {
    tab: 'wx',
    loginName: '',
    password: '',
    loading: false,
    err: '',
  },

  onLoad() {
    if (mpAuth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  onTabWx() {
    this.setData({ tab: 'wx', err: '' })
  },
  onTabPwd() {
    this.setData({ tab: 'pwd', err: '' })
  },
  onLoginName(e) {
    this.setData({ loginName: e.detail.value })
  },
  onPassword(e) {
    this.setData({ password: e.detail.value })
  },

  async onWxLogin() {
    this.setData({ loading: true, err: '' })
    try {
      const local = wxAccount.readWxAccount()
      let nick = local && local.wxNickName ? local.wxNickName : ''
      let avatar = local && local.wxAvatarUrl ? local.wxAvatarUrl : ''
      if (!nick) {
        const prof = await new Promise((resolve, reject) => {
          wx.getUserProfile({
            desc: '用于灵祺账号绑定',
            success: resolve,
            fail: reject,
          })
        })
        nick = prof.userInfo.nickName
        avatar = prof.userInfo.avatarUrl
        wxAccount.writeWxAccount({ wxNickName: nick, wxAvatarUrl: avatar })
      }
      const role = userProfile.readIdentity().role === 'pr' ? 'pr' : 'talent'
      await mpAuth.wxLogin({
        role,
        wxNickName: nick,
        wxAvatarUrl: avatar,
      })
      wx.switchTab({ url: '/pages/index/index' })
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      this.setData({ err: msg.indexOf('wx_not_configured') >= 0 ? '服务端未配置微信密钥，请联系管理员' : msg })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onPwdLogin() {
    this.setData({ loading: true, err: '' })
    try {
      await mpAuth.passwordLogin(this.data.loginName.trim(), this.data.password)
      wx.switchTab({ url: '/pages/index/index' })
    } catch (e) {
      this.setData({ err: e && e.message ? e.message : '登录失败' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
