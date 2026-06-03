const mpAuth = require('../../utils/mpAccountAuth.js')
const wxAccount = require('../../utils/wxAccount.js')
const userProfile = require('../../utils/userProfile.js')
const ecs = require('../../utils/ecsApi.js')

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
    if (mpAuth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    void this.probeEcs()
  },

  async probeEcs() {
    try {
      const h = await ecs.pingEcs()
      if (h && h.ok) {
        this.setData({ netOk: `ECS 可达 revision=${h.revision || '?'}` })
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      if (/reset|cronet|-101/i.test(msg)) {
        this.setData({
          netOk: 'ECS HTTPS 被微信重置：请在服务器执行 bash scripts/ecs-fix-mp-api-public.sh，并检查域名勿配 AAAA',
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
        } catch (_) {
          /* 未授权头像昵称也可登录：服务端按 openid 自动注册并分配灵祺 ID */
        }
      }
      const role = userProfile.readIdentity().role === 'pr' ? 'pr' : 'talent'
      const data = await mpAuth.wxLogin({
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
      } else if (/reset|cronet|download:fail|request:fail/i.test(msg)) {
        const build = ecs.MP_BUILD_ID || 'mp-20260604-ecs-get-login'
        hint =
          msg +
          `\n\n① 合法域名仅 https://mofangdianai.com；② ECS: bash scripts/ecs-fix-mp-wechat-login.sh；③ 体验版 ${build}，删小程序重扫。`
      } else if (/supabase_admin_not_configured|chat_supabase|not_configured/i.test(msg)) {
        hint = msg + '\n\nECS: bash scripts/ecs-fix-mp-chat-path.sh'
      }
      this.setData({ err: hint })
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
