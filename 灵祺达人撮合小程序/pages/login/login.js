const auth = require('../../utils/auth.js')
const wxAccount = require('../../utils/wxAccount.js')
const userProfile = require('../../utils/userProfile.js')
const api = require('../../utils/api.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')

Page({
  data: {
    tab: 'wx',
    loginName: '',
    password: '',
    loading: false,
    err: '',
    navBandStyle: '',
    navInnerStyle: '',
    promoLead: '一微信一灵祺 ID · 达人接单与 PR 发单同台',
    promoFlow: '完善资料即刻匹配 · 商单自动置顶 · 通知群码私信一站完成',
    promoPills: [
      { tag: '达人', text: 'AI 置顶高契合商单' },
      { tag: 'PR', text: '按招募智能荐达人' },
      { tag: '一体', text: '入选·群码·私信同台' },
    ],
    promoSteps: [
      { n: '1', title: '微信登录', sub: '绑定灵祺 ID' },
      { n: '2', title: '完善资料', sub: '平台与报价' },
      { n: '3', title: '接单履约', sub: '通知与群码' },
    ],
  },

  onLoad() {
    applyCapsulePadding(this, null, { band: 'navBandStyle', right: 'navInnerStyle' })
    this.setData({ err: '' })
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  onShow() {
    applyCapsulePadding(this, null, { band: 'navBandStyle', right: 'navInnerStyle' })
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
      const role = userProfile.readIdentity() === 'pr' ? 'pr' : 'talent'
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
        hint = '网络不稳定，请稍后重试或删除小程序重新扫码'
      } else if (/admin_not_configured|not_configured/i.test(msg)) {
        hint = '服务暂不可用，请联系管理员'
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
