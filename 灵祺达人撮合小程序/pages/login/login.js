const auth = require('../../utils/auth.js')
const mpApiErrors = require('../../utils/mpApiErrors.js')
const wxAccount = require('../../utils/wxAccount.js')
const userProfile = require('../../utils/userProfile.js')
const identityTypes = require('../../utils/identityTypes.js')
const switchWorkIdentity = require('../../utils/switchWorkIdentity.js')
const mpPhoneAuth = require('../../utils/mpPhoneAuth.js')
const api = require('../../utils/api.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const { ORBIT_IMAGES } = require('../../utils/loginOrbitAssets.js')
const { attachLoginIdentityIcons, loginIdentityIcon } = require('../../utils/loginIdentityIcons.js')

const IDENTITY_OPTIONS = attachLoginIdentityIcons(
  identityTypes.WORK_ID_LIST.map((id) => identityTypes.WORK_IDENTITIES[id]),
)

function requireLoginIdentity(page) {
  const id = page.data.loginIdentity
  if (!identityTypes.isWorkIdentity(id)) {
    page.setData({ err: '请先选择登录身份（达人 / 拍摄 / 剪辑 / PR）' })
    return null
  }
  userProfile.writeIdentity(id)
  return id
}

async function applyLoginIdentity(data, workId) {
  const role = identityTypes.accountRoleForWorkIdentity(workId)
  if (data && data.token && data.account) {
    if (data.account.activeRole !== role) {
      try {
        await auth.switchRole(role)
      } catch (_) {}
    }
    await switchWorkIdentity.applyWorkIdentityAfterLogin(
      data.token || auth.readSessionToken(),
      auth.readAccount() || data.account,
      workId,
    )
  } else {
    try {
      await switchWorkIdentity.ensureWorkIdentityIfNeeded()
    } catch (_) {}
  }
}

async function enterAppAfterLogin() {
  const tabBar = require('../../utils/tabBar.js')
  tabBar.refreshTabBar()
  wx.switchTab({ url: '/pages/index/index' })
}

Page({
  data: {
    tab: 'wx',
    loginIdentity: '',
    loginIdentityLabel: '',
    loginIdentityIcon: '',
    showIdentitySheet: false,
    identityOptions: IDENTITY_OPTIONS,
    loginName: '',
    password: '',
    regPhone: '',
    regSmsCode: '',
    regPassword: '',
    smsSending: false,
    smsCooldown: 0,
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
    orbitImages: ORBIT_IMAGES,
    wxNickName: '',
    wxAvatarUrl: '',
    showWxAuthSheet: false,
    wxAuthStep: 'avatar',
    pendingWorkId: '',
  },

  onLoad() {
    this.applyLoginNavPadding()
    const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')
    const cache = wxProfileDisplay.readWxProfileCache()
    const local = wxAccount.readWxAccount()
    this.setData({
      err: '',
      loginIdentity: '',
      loginIdentityLabel: '',
      wxNickName: wxProfileDisplay.pickWxNick(cache && cache.wxNickName, local && local.wxNickName),
      wxAvatarUrl: wxProfileDisplay.pickWxAvatar(cache && cache.wxAvatarUrl, local && local.wxAvatarUrl),
    })
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  onShow() {
    this.applyLoginNavPadding()
  },

  applyLoginNavPadding() {
    applyCapsulePadding(this, null, { band: 'navBandStyle', right: 'navInnerStyle' })
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menu = wx.getMenuButtonBoundingClientRect()
      const pxToRpx = 750 / win.windowWidth
      const topRpx = Math.max(0, Math.round(menu.top * pxToRpx) - 16)
      const rightRpx = Math.round((win.windowWidth - menu.left + 12) * pxToRpx)
      this.setData({
        navBandStyle: `padding-top:${topRpx}rpx;`,
        navInnerStyle: `padding-right:${rightRpx}rpx;`,
      })
    } catch (_) {}
  },

  onOpenIdentitySheet() {
    this.setData({ showIdentitySheet: true, err: '' })
  },

  onCloseIdentitySheet() {
    this.setData({ showIdentitySheet: false })
  },

  noopSheetTap() {},

  onPickLoginIdentity(e) {
    const id = e.currentTarget.dataset.id
    if (!identityTypes.isWorkIdentity(id)) return
    const meta = identityTypes.WORK_IDENTITIES[id]
    userProfile.writeIdentity(id)
    this.setData({
      loginIdentity: id,
      loginIdentityLabel: meta.label,
      loginIdentityIcon: loginIdentityIcon(id),
      showIdentitySheet: false,
      err: '',
    })
  },

  onTabWx() {
    this.setData({ tab: 'wx', err: '' })
  },
  onTabPwd() {
    this.setData({ tab: 'pwd', err: '' })
  },
  onTabReg() {
    this.setData({ tab: 'reg', err: '' })
  },
  onLoginName(e) {
    this.setData({ loginName: mpPhoneAuth.sanitizePhoneInput(e.detail.value) })
  },
  onRegPhone(e) {
    this.setData({ regPhone: mpPhoneAuth.sanitizePhoneInput(e.detail.value) })
  },
  onRegSmsCode(e) {
    this.setData({ regSmsCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) })
  },
  onRegPassword(e) {
    this.setData({ regPassword: e.detail.value })
  },
  onPassword(e) {
    this.setData({ password: e.detail.value })
  },

  onWxChooseAvatar(e) {
    const url = e.detail && e.detail.avatarUrl
    if (!url) return
    const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')
    this.setData({ wxAvatarUrl: url })
    wxProfileDisplay.writeWxProfileCache({ wxAvatarUrl: url })
    if (this.data.showWxAuthSheet && this.data.wxAuthStep === 'avatar') {
      this.setData({ wxAuthStep: 'nick' })
      wx.showToast({ title: '请选用微信昵称', icon: 'none' })
    }
  },

  onWxNicknameInput(e) {
    const nick = e.detail.value || ''
    this.setData({ wxNickName: nick })
    if (nick) require('../../utils/wxProfileDisplay.js').writeWxProfileCache({ wxNickName: nick })
  },

  onWxNicknameReview(e) {
    const nick = String((e.detail && e.detail.nickname) || (e.detail && e.detail.value) || '').trim()
    if (!nick) return
    this.setData({ wxNickName: nick })
    require('../../utils/wxProfileDisplay.js').writeWxProfileCache({ wxNickName: nick })
    if (this.data.showWxAuthSheet && this.data.wxAuthStep === 'nick') {
      void this.finishWxAuthAndLogin()
    }
  },

  onCloseWxAuthSheet() {
    this.setData({ showWxAuthSheet: false, wxAuthStep: 'avatar', pendingWorkId: '' })
  },

  onConfirmWxNickStep() {
    void this.finishWxAuthAndLogin()
  },

  onWxLogin() {
    const workId = requireLoginIdentity(this)
    if (!workId) return
    this.setData({
      err: '',
      showWxAuthSheet: true,
      wxAuthStep: 'avatar',
      pendingWorkId: workId,
      wxNickName: '',
      wxAvatarUrl: '',
    })
    wx.showToast({ title: '请授权微信头像', icon: 'none' })
  },

  async finishWxAuthAndLogin() {
    if (this.data.loading) return
    const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')
    const workId = this.data.pendingWorkId
    if (!workId) {
      this.onCloseWxAuthSheet()
      return
    }
    const nick = String(this.data.wxNickName || '').trim()
    let avatar = String(this.data.wxAvatarUrl || '').trim()
    if (!avatar) {
      wx.showToast({ title: '请先授权微信头像', icon: 'none' })
      this.setData({ wxAuthStep: 'avatar' })
      return
    }
    if (!nick || wxProfileDisplay.isPlaceholderWxNick(nick)) {
      wx.showToast({ title: '请选用微信昵称', icon: 'none' })
      this.setData({ wxAuthStep: 'nick' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      avatar = await wxProfileDisplay.persistWxAvatarUrl(avatar)
      const role = identityTypes.accountRoleForWorkIdentity(workId)
      const data = await auth.wxLogin({
        role,
        wxNickName: nick,
        wxAvatarUrl: avatar,
      })
      if (data.isNew) {
        const acct = auth.readAccount()
        const id =
          role === 'pr'
            ? acct && acct.lingqiPrId
            : workId === 'shoot'
              ? acct && acct.lingqiShootTeamId
              : workId === 'edit'
                ? acct && acct.lingqiEditTeamId
                : acct && acct.lingqiTalentId
        wx.showToast({
          title: id ? `已创建账号 ${id}` : '已创建灵祺账号',
          icon: 'none',
          duration: 2500,
        })
      }
      await applyLoginIdentity(data, workId)
      await wxProfileDisplay.applyWxProfileAfterLogin(nick, avatar)
      this.setData({ showWxAuthSheet: false, pendingWorkId: '' })
      await enterAppAfterLogin()
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
    const workId = requireLoginIdentity(this)
    if (!workId) return
    this.setData({ loading: true, err: '' })
    try {
      const data = await auth.passwordLogin(this.data.loginName.trim(), this.data.password)
      await applyLoginIdentity(data, workId)
      await enterAppAfterLogin()
    } catch (e) {
      this.setData({ err: e && e.message ? e.message : '登录失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onSendRegSms() {
    const err = mpPhoneAuth.validatePhoneAccount(this.data.regPhone)
    if (err) {
      this.setData({ err })
      return
    }
    this.setData({ smsSending: true, err: '' })
    try {
      await auth.sendRegisterSms(this.data.regPhone)
      wx.showToast({ title: '验证码已发送', icon: 'none' })
      this.setData({ smsCooldown: 60 })
      const tick = setInterval(() => {
        const n = this.data.smsCooldown - 1
        if (n <= 0) {
          clearInterval(tick)
          this.setData({ smsCooldown: 0 })
        } else {
          this.setData({ smsCooldown: n })
        }
      }, 1000)
    } catch (e) {
      this.setData({ err: mpApiErrors.formatMpApiErr(e, '验证码发送失败') })
    } finally {
      this.setData({ smsSending: false })
    }
  },

  async onRegister() {
    const workId = requireLoginIdentity(this)
    if (!workId) return
    const phoneErr = mpPhoneAuth.validatePhoneAccount(this.data.regPhone)
    if (phoneErr) {
      this.setData({ err: phoneErr })
      return
    }
    if (!/^\d{6}$/.test(this.data.regSmsCode)) {
      this.setData({ err: '请输入 6 位验证码' })
      return
    }
    if (String(this.data.regPassword || '').length < 6) {
      this.setData({ err: '密码至少 6 位' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const role = identityTypes.accountRoleForWorkIdentity(workId)
      const data = await auth.phoneRegister({
        phone: this.data.regPhone,
        smsCode: this.data.regSmsCode,
        password: this.data.regPassword,
        role,
      })
      wx.showToast({ title: '注册成功', icon: 'success' })
      await applyLoginIdentity(data, workId)
      await enterAppAfterLogin()
    } catch (e) {
      this.setData({ err: mpApiErrors.formatMpApiErr(e, '注册失败，请稍后重试') })
    } finally {
      this.setData({ loading: false })
    }
  },
})
