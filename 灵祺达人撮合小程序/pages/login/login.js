const auth = require('../../utils/auth.js')
const wxAccount = require('../../utils/wxAccount.js')
const userProfile = require('../../utils/userProfile.js')
const api = require('../../utils/api.js')

Page({
  data: {
    tab: 'wx',
    loginName: '',
    password: '',
    loading: false,
    err: '',
    netOk: '',
  },

  onLoad() {
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    void this.probeEcs()
  },

  async probeEcs() {
    try {
      const h = await api.ping()
      if (h && h.ok) {
        const via = api.transportLabel ? api.transportLabel() : 'direct'
        this.setData({ netOk: `ECS 可达(${via}) revision=${h.revision || '?'}` })
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      if (api.isNetReset(msg)) {
        this.setData({
          netOk:
            '请走云开发绕过域名：见 备案期启动-绕过域名.md，填写 MP_CLOUD_ENV 并部署 mpErpProxy',
        })
      }
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
        try {
          const prof = await new Promise((resolve, reject) => {
            wx.getUserProfile({
              desc: '用于灵祺账号展示',
              success: resolve,
              fail: reject,
            })
          })
          nick = prof.userInfo.nickName
          avatar = prof.userInfo.avatarUrl
          wxAccount.writeWxAccount({ wxNickName: nick, wxAvatarUrl: avatar })
        } catch (_) {}
      }
      const role = userProfile.readIdentity().role === 'pr' ? 'pr' : 'talent'
      const data = await auth.wxLogin({
        role,
        wxNickName: nick,
        wxAvatarUrl: avatar,
      })
      if (data.isNew) {
        const id =
          role === 'pr'
            ? data.account && data.account.lingqiPrId
            : data.account && data.account.lingqiTalentId
        wx.showToast({
          title: id ? `已创建账号 ${id}` : '已创建灵祺账号',
          icon: 'none',
          duration: 2500,
        })
      }
      wx.switchTab({ url: '/pages/index/index' })
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      let hint = msg
      if (msg.indexOf('wx_not_configured') >= 0) {
        hint = '服务端未配置微信密钥，请联系管理员'
      } else if (/invalid code|wx_code2session/i.test(msg)) {
        hint = '微信登录码无效或已过期，请再点一次「微信登录」重试'
      } else if (api.isNetReset(msg)) {
        const build = api.BUILD_ID
        hint =
          msg +
          `\n\n① 合法域名 https://mofangdianai.com；② ECS: bash scripts/ecs-check-aliyun-beian-wechat.sh；③ 体验版 ${build}；④ 未完成阿里云「接入备案」时微信会一直 -101。`
      } else if (/admin_not_configured|not_configured/i.test(msg)) {
        hint = msg + '\n\nECS: bash scripts/ecs-mp-minimal.sh'
      }
      this.setData({ err: hint })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onPwdLogin() {
    this.setData({ loading: true, err: '' })
    try {
      await auth.passwordLogin(this.data.loginName.trim(), this.data.password)
      wx.switchTab({ url: '/pages/index/index' })
    } catch (e) {
      this.setData({ err: e && e.message ? e.message : '登录失败' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
