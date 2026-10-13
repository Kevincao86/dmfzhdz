const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const tenantAuthApi = require('../../utils/tenantAuthApiMp.js')
const wxAccountMp = require('../../utils/wxAccountMp.js')
const loginLegalAgree = require('../../utils/loginLegalAgree.js')
const { assetUrl } = require('../../utils/mpStaticAssets.js')

const PRIVACY_AGREE_BTN_ID = 'merchant-privacy-agree-btn'

function isWxPrivacyUndeclared(detail) {
  const errMsg = String((detail && detail.errMsg) || '')
  const errno = Number(detail && detail.errno)
  return errno === 112 || /not declared in the privacy agreement/i.test(errMsg)
}

function isWxPrivacyBlock(detail) {
  if (isWxPrivacyUndeclared(detail)) return false
  const errMsg = String((detail && detail.errMsg) || '')
  const errno = Number(detail && detail.errno)
  return errno === 104 || /privacy|needAuthorization/i.test(errMsg)
}

function wxPhoneAuthFailHint(detail) {
  const errMsg = String((detail && detail.errMsg) || '')
  let platform = ''
  try {
    platform = String((wx.getSystemInfoSync() || {}).platform || '')
  } catch (_) {}
  if (isWxPrivacyUndeclared(detail)) {
    return '请先在微信公众平台的用户隐私保护指引里填写「手机号」用途，保存后再登录'
  }
  if (platform === 'devtools') {
    return '开发者工具读不到真实手机号，请用「预览」扫到手机上再点快捷登录'
  }
  if (/deny|cancel|拒绝/i.test(errMsg)) {
    return '需要在微信弹窗里允许使用绑定的手机号'
  }
  return '未能读取微信手机号，请再点一次「微信一键登录」'
}

const LANDING_WAYS = [
  { id: 'pwd', mark: '账号', label: '密码登录', sub: '登录名与密码进入工作台' },
  { id: 'sms', mark: '快捷', label: '验证码', sub: '手机号短信验证码登录' },
  { id: 'reg', mark: '入驻', label: '注册', sub: '新开商家账号，免费起步' },
  { id: 'wx', mark: '手机', label: '快捷登录', sub: '微信授权手机号，进入工作台' },
]

const MODE_HINT = {
  login_password: '使用登录名与密码进入商家工作台。',
  login_sms: '使用注册手机号与短信验证码登录。',
  register: '填写商家信息并完成手机验证，注册后为免费版，可订阅升级会员。',
}

Page({
  data: {
    mode: 'login',
    loginMethod: 'password',
    modeHint: MODE_HINT.login_password,
    loginName: '',
    password: '',
    loginPhone: '',
    loginSmsCode: '',
    loginSmsCooldown: 0,
    loginSmsSending: false,
    regLoginName: '',
    merchantName: '',
    phone: '',
    smsCode: '',
    regPassword: '',
    confirmPassword: '',
    smsCooldown: 0,
    smsSending: false,
    err: '',
    infoHint: '',
    busy: false,
    wxBusy: false,
    refreshing: false,
    submitLabel: '登录并进入工作台',
    devSkip: false,
    legalAgreed: false,
    showBindPhone: false,
    bindPhone: '',
    bindSmsCode: '',
    bindSmsSending: false,
    bindSmsCooldown: 0,
    bindMergeToken: '',
    bindMergeMsg: '',
    bindNeedCode: false,
    bindAccessToken: '',
    logoSrc: assetUrl('logo.png'),
    pickedId: '',
    wxPrivacyPending: false,
    hasSession: false,
    navBandStyle: '',
    landingWays: LANDING_WAYS,
    platformLogos: [
      { id: 'douyin', icon: assetUrl('platforms/douyin.png') },
      { id: 'xiaohongshu', icon: assetUrl('platforms/xiaohongshu.png') },
      { id: 'dianping', icon: assetUrl('platforms/dianping.png') },
      { id: 'meituan', icon: assetUrl('platforms/meituan-waimai.png') },
      { id: 'kuaishou', icon: assetUrl('platforms/kuaishou-local.png') },
    ],
  },

  onLoad(options) {
    const raw = options && options.redirect ? String(options.redirect) : ''
    try {
      this._redirect = raw ? decodeURIComponent(raw) : ''
    } catch (_) {
      this._redirect = raw
    }
    loginLegalAgree.writeAgreed(false)
    this.setData({
      devSkip: devAuth.isDevSkipLogin(),
      legalAgreed: false,
      hasSession: Boolean(api.getBearerToken()),
    })
    this._applyNavPadding()
    this._syncModeHint()
    this._bindWxPrivacy()
    void api.bootstrapSupabaseConfig()
    this._waitSplash = true
    this._splashSafety = setTimeout(() => this.onLaunchSplashDone(), 8000)
  },

  onLaunchSplashDone() {
    if (!this._waitSplash) return
    this._waitSplash = false
    if (this._splashSafety) {
      clearTimeout(this._splashSafety)
      this._splashSafety = null
    }
    this._enterWorkspaceIfLoggedIn()
  },

  onUnload() {
    this._clearCooldownTimers()
    if (this._splashSafety) {
      clearTimeout(this._splashSafety)
      this._splashSafety = null
    }
  },

  onShow() {
    this._applyNavPadding()
    this.setData({
      devSkip: devAuth.isDevSkipLogin(),
      hasSession: Boolean(api.getBearerToken()),
    })
    try {
      if (wx.getStorageSync('meoo_just_logged_out')) {
        wx.removeStorageSync('meoo_just_logged_out')
        return
      }
    } catch (_) {}
    if (this._waitSplash) return
    this._enterWorkspaceIfLoggedIn()
  },

  _enterWorkspaceIfLoggedIn() {
    try {
      if (wx.getStorageSync('meoo_just_logged_out')) return false
    } catch (_) {}
    if (!api.getBearerToken()) return false
    const dest = this._redirect && this._redirect.startsWith('/') ? this._redirect : '/pages/dashboard/dashboard'
    if (dest === '/pages/functions/functions' || dest === '/pages/dashboard/dashboard' || dest === '/pages/ai-agent/ai-agent' || dest === '/pages/mine/mine') {
      wx.switchTab({
        url: dest,
        fail: () => wx.reLaunch({ url: dest }),
      })
    } else {
      wx.reLaunch({ url: dest })
    }
    return true
  },

  onGuestBrowse() {
    api.enterGuestBrowse()
    wx.switchTab({
      url: '/pages/dashboard/dashboard',
      fail: () => wx.reLaunch({ url: '/pages/dashboard/dashboard' }),
    })
  },

  onLeaveLogin() {
    api.enterGuestBrowse()
    const stack = getCurrentPages()
    if (stack.length > 1) {
      wx.navigateBack({
        delta: 1,
        fail: () => this.onGuestBrowse(),
      })
      return
    }
    this.onGuestBrowse()
  },

  onCancelBindPhone() {
    const loggedIn = Boolean(api.getBearerToken())
    this.setData({
      showBindPhone: false,
      bindMergeToken: '',
      bindMergeMsg: '',
      bindNeedCode: false,
      bindSmsCode: '',
      err: '',
    })
    if (loggedIn) this._goHome()
  },

  onToggleLegalAgree() {
    const legalAgreed = !this.data.legalAgreed
    this.setData({ legalAgreed, err: '' })
    if (legalAgreed && this.data.pickedId === 'wx') this._refreshWxPrivacy()
  },

  _bindWxPrivacy() {
    if (this._wxPrivacyBound) return
    this._wxPrivacyBound = true
    if (typeof wx.onNeedPrivacyAuthorization !== 'function') return
    wx.onNeedPrivacyAuthorization((resolve) => {
      this._privacyResolve = resolve
      this.setData({ wxPrivacyPending: true, err: '' })
    })
  },

  _refreshWxPrivacy() {
    if (typeof wx.getPrivacySetting !== 'function') {
      this.setData({ wxPrivacyPending: false })
      return
    }
    wx.getPrivacySetting({
      success: (res) => {
        const pending = !!(res && res.needAuthorization)
        this.setData({ wxPrivacyPending: pending, err: pending ? '' : this.data.err })
      },
      fail: () => this.setData({ wxPrivacyPending: false }),
    })
  },

  onWxPrivacyAgree() {
    const resolve = this._privacyResolve
    this._privacyResolve = null
    if (typeof resolve === 'function') {
      resolve({ event: 'agree', buttonId: PRIVACY_AGREE_BTN_ID })
    }
    this.setData({ wxPrivacyPending: false, err: '' })
  },

  onOpenLegal(e) {
    const doc = e.currentTarget.dataset.doc === 'aup' ? 'aup' : 'privacy'
    wx.navigateTo({ url: `/pages/legal/legal?doc=${doc}` })
  },

  _ensureLegalAgreed() {
    if (this.data.legalAgreed) return true
    wx.showToast({ title: '请先阅读并勾选协议', icon: 'none' })
    return false
  },

  onDevPreview() {
    if (!devAuth.isDevSkipLogin()) return
    devAuth.applyDevSession()
    this._goHome()
  },

  async onRefreshPage() {
    if (this.data.refreshing) return
    this._clearCooldownTimers()
    this.setData({ busy: false, refreshing: true, err: '', infoHint: '' })
    try {
      wx.reLaunch({ url: '/pages/login/login' })
    } catch (_) {
      wx.showToast({ title: '刷新失败，请稍后再试', icon: 'none' })
    } finally {
      this.setData({ refreshing: false })
    }
  },

  _clearCooldownTimers() {
    if (this._loginCdTimer) clearInterval(this._loginCdTimer)
    if (this._regCdTimer) clearInterval(this._regCdTimer)
    if (this._bindCdTimer) clearInterval(this._bindCdTimer)
    this._loginCdTimer = null
    this._regCdTimer = null
    this._bindCdTimer = null
  },

  _startCooldown(field, timerKey) {
    this.setData({ [field]: 60 })
    const key = timerKey === 'login' ? '_loginCdTimer' : timerKey === 'bind' ? '_bindCdTimer' : '_regCdTimer'
    if (this[key]) clearInterval(this[key])
    this[key] = setInterval(() => {
      const v = this.data[field]
      if (v <= 1) {
        clearInterval(this[key])
        this[key] = null
        this.setData({ [field]: 0 })
        return
      }
      this.setData({ [field]: v - 1 })
    }, 1000)
  },

  _applyNavPadding() {
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menu = wx.getMenuButtonBoundingClientRect()
      const pxToRpx = 750 / win.windowWidth
      const menuTopRpx = Math.round(menu.top * pxToRpx)
      this.setData({ navBandStyle: `padding-top:${menuTopRpx}rpx;` })
    } catch (_) {
      this.setData({
        navBandStyle: 'padding-top:calc(env(safe-area-inset-top) + 88rpx);',
      })
    }
  },

  _syncModeHint() {
    const { mode, loginMethod } = this.data
    let modeHint = MODE_HINT.register
    let submitLabel = '确认注册'
    if (mode === 'login') {
      modeHint = loginMethod === 'password' ? MODE_HINT.login_password : MODE_HINT.login_sms
      submitLabel = loginMethod === 'password' ? '登录并进入工作台' : '验证码登录'
    }
    this.setData({ modeHint, submitLabel })
  },

  _clearErr() {
    this.setData({ err: '', infoHint: '' })
  },

  onPickLanding(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this._clearErr()
    if (id === 'pwd') {
      this.setData({ pickedId: 'pwd', mode: 'login', loginMethod: 'password' })
    } else if (id === 'sms') {
      this.setData({ pickedId: 'sms', mode: 'login', loginMethod: 'sms' })
    } else if (id === 'reg') {
      this.setData({ pickedId: 'reg', mode: 'register' })
    } else if (id === 'wx') {
      this.setData({ pickedId: 'wx', mode: 'login', loginMethod: 'password' })
      this._syncModeHint()
      if (this.data.legalAgreed) this._refreshWxPrivacy()
      return
    }
    this._syncModeHint()
  },

  onSwitchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.mode) return
    this._clearErr()
    this.setData({
      mode,
      pickedId: mode === 'register' ? 'reg' : this.data.loginMethod === 'sms' ? 'sms' : 'pwd',
    })
    this._syncModeHint()
  },

  onSwitchLoginMethod(e) {
    const loginMethod = e.currentTarget.dataset.method
    if (!loginMethod || loginMethod === this.data.loginMethod) return
    this._clearErr()
    this.setData({ loginMethod, pickedId: loginMethod === 'sms' ? 'sms' : 'pwd' })
    this._syncModeHint()
  },

  onLoginName(e) {
    this.setData({ loginName: e.detail.value })
    this._clearErr()
  },
  onPassword(e) {
    this.setData({ password: e.detail.value })
    this._clearErr()
  },
  onLoginPhone(e) {
    this.setData({ loginPhone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) })
    this._clearErr()
  },
  onLoginSmsCode(e) {
    this.setData({ loginSmsCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) })
    this._clearErr()
  },
  onRegLoginName(e) {
    this.setData({ regLoginName: String(e.detail.value || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) })
    this._clearErr()
  },
  onMerchantName(e) {
    this.setData({ merchantName: String(e.detail.value || '').slice(0, 30) })
    this._clearErr()
  },
  onPhone(e) {
    this.setData({ phone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) })
    this._clearErr()
  },
  onSmsCode(e) {
    this.setData({ smsCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) })
    this._clearErr()
  },
  onRegPassword(e) {
    this.setData({ regPassword: e.detail.value })
    this._clearErr()
  },
  onConfirmPassword(e) {
    this.setData({ confirmPassword: e.detail.value })
    this._clearErr()
  },

  async onSendLoginSms() {
    const mobile = String(this.data.loginPhone || '').replace(/\D/g, '')
    if (!tenantAuthApi.isCnMobileValid(mobile)) {
      this.setData({ err: '请输入正确的 11 位手机号' })
      return
    }
    this.setData({ loginSmsSending: true, err: '' })
    try {
      const r = await tenantAuthApi.sendAuthSms(mobile)
      if (!r.ok) {
        this.setData({ err: r.message || '发送失败' })
        return
      }
      this._startCooldown('loginSmsCooldown', 'login')
      if (r.devCode) {
        this.setData({ loginSmsCode: r.devCode, infoHint: `开发环境验证码：${r.devCode}` })
      } else {
        this.setData({ infoHint: '验证码已发送，请查收短信' })
      }
    } finally {
      this.setData({ loginSmsSending: false })
    }
  },

  async onSendRegSms() {
    const mobile = String(this.data.phone || '').replace(/\D/g, '')
    if (!tenantAuthApi.isCnMobileValid(mobile)) {
      this.setData({ err: '请输入正确的 11 位手机号' })
      return
    }
    this.setData({ smsSending: true, err: '' })
    try {
      const r = await tenantAuthApi.sendAuthSms(mobile)
      if (!r.ok) {
        this.setData({ err: r.message || '发送失败' })
        return
      }
      this._startCooldown('smsCooldown', 'reg')
      if (r.devCode) {
        this.setData({ smsCode: r.devCode, infoHint: `开发环境验证码：${r.devCode}` })
      } else {
        this.setData({ infoHint: '验证码已发送，请查收短信' })
      }
    } finally {
      this.setData({ smsSending: false })
    }
  },

  async _goHome() {
    this.setData({ busy: true })
    try {
      const app = getApp()
      if (app && typeof app.syncMerchantSession === 'function') {
        await app.syncMerchantSession({ force: true })
      }
    } catch (_) {}
    this.setData({ busy: false })
    const redirect = String(this._redirect || '').trim()
    const tabPaths = [
      '/pages/functions/functions',
      '/pages/dashboard/dashboard',
      '/pages/ai-agent/ai-agent',
      '/pages/mine/mine',
    ]
    if (redirect) {
      const path = redirect.split('?')[0]
      if (tabPaths.some((p) => path === p || path.endsWith(p))) {
        wx.switchTab({ url: path, fail: () => wx.switchTab({ url: '/pages/dashboard/dashboard' }) })
        return
      }
      wx.redirectTo({
        url: redirect,
        fail: () =>
          wx.navigateTo({
            url: redirect,
            fail: () => wx.switchTab({ url: '/pages/dashboard/dashboard' }),
          }),
      })
      return
    }
    wx.switchTab({
      url: '/pages/dashboard/dashboard',
      fail: () => {
        wx.showToast({ title: '进入工作台失败，请重试', icon: 'none' })
      },
    })
  },

  async onWxLogin() {
    if (this.data.busy || this.data.wxBusy) return
    if (!this._ensureLegalAgreed('wx')) return
  },

  onGetPhoneNumber(e) {
    const detail = (e && e.detail) || {}
    const phoneCode = String(detail.code || '').trim()
    if (this.data.busy || this.data.wxBusy) return
    if (!this._ensureLegalAgreed('wx')) return
    if (detail.errMsg && String(detail.errMsg).indexOf('ok') < 0) {
      if (isWxPrivacyBlock(detail)) {
        this.setData({ wxPrivacyPending: true, err: '' })
        return
      }
      this.setData({ err: wxPhoneAuthFailHint(detail) })
      return
    }
    if (!phoneCode) {
      this.setData({ err: '未能读取微信手机号，请再点一次「微信一键登录」' })
      return
    }
    void this._doWxLogin(phoneCode)
  },

  onGetPhoneNumberRegister(e) {
    const detail = (e && e.detail) || {}
    const phoneCode = String(detail.code || '').trim()
    if (this.data.busy || this.data.wxBusy) return
    if (!this._ensureLegalAgreed('wx')) return
    if (detail.errMsg && String(detail.errMsg).indexOf('ok') < 0) {
      if (isWxPrivacyBlock(detail)) {
        this.setData({ wxPrivacyPending: true, err: '' })
        return
      }
      this.setData({ err: wxPhoneAuthFailHint(detail).replace('微信一键登录', '微信一键注册') })
      return
    }
    if (!phoneCode) {
      this.setData({ err: '未能读取微信手机号，请再点一次「微信一键注册」' })
      return
    }
    void this._doWxRegister(phoneCode)
  },

  async _doWxRegister(phoneCode) {
    if (this.data.busy || this.data.wxBusy) return
    if (!tenantAuthApi.apiRoot()) {
      this.setData({ err: '未配置 MERCHANT_API_BASE_URL，无法使用微信注册' })
      return
    }
    const phoneAuthCode = String(phoneCode || '').trim()
    if (!phoneAuthCode) {
      this.setData({ err: '请先授权微信绑定的手机号' })
      return
    }
    this.setData({ wxBusy: true, err: '', infoHint: '' })
    try {
      const wxSession = await wxAccountMp.fetchWxLoginCode()
      const r = await tenantAuthApi.loginWithWxCode({
        code: wxSession.code,
        stableDevOpenId: wxSession.stableDevOpenId,
        phoneCode: phoneAuthCode,
      })
      if (!r.ok || !r.access_token) {
        this.setData({ err: r.message || r.detail || '一键注册失败' })
        return
      }
      if (r.isNew === false) {
        this.setData({ err: '该账号已注册，请返回并登录' })
        return
      }
      api.persistSession(
        { access_token: r.access_token, refresh_token: r.refresh_token || '' },
        r.loginName || '',
      )
      this._goHome()
    } catch (e) {
      const msg = e && e.message ? e.message : '一键注册失败'
      this.setData({ err: msg })
    } finally {
      this.setData({ wxBusy: false })
    }
  },

  async _doWxLogin(phoneCode) {
    if (this.data.busy || this.data.wxBusy) return
    if (!tenantAuthApi.apiRoot()) {
      this.setData({ err: '未配置 MERCHANT_API_BASE_URL，无法使用快捷登录' })
      return
    }
    const phoneAuthCode = String(phoneCode || '').trim()
    if (!phoneAuthCode) {
      this.setData({ err: '请先授权微信绑定的手机号' })
      return
    }
    this.setData({ wxBusy: true, err: '', infoHint: '' })
    try {
      const wxSession = await wxAccountMp.fetchWxLoginCode()
      const r = await tenantAuthApi.loginWithWxCode({
        code: wxSession.code,
        stableDevOpenId: wxSession.stableDevOpenId,
        phoneCode: phoneAuthCode,
      })
      if (!r.ok || !r.access_token) {
        this.setData({
          err: r.message || r.detail || '快捷登录失败',
          infoHint: r.isNew ? '' : this.data.infoHint,
        })
        return
      }
      api.persistSession(
        { access_token: r.access_token, refresh_token: r.refresh_token || '' },
        r.loginName || '',
      )
      this._goHome()
    } catch (e) {
      const msg = e && e.message ? e.message : '快捷登录失败'
      this.setData({ err: msg })
    } finally {
      this.setData({ wxBusy: false })
    }
  },

  async onSubmit() {
    if (this.data.mode === 'login' && this.data.loginMethod === 'password') {
      if (!this._ensureLegalAgreed('pwd')) return
      await this._submitPassword()
      return
    }
    if (this.data.mode === 'login') {
      if (!this._ensureLegalAgreed('sms')) return
      await this._submitSmsLogin()
      return
    }
    if (!this._ensureLegalAgreed('reg')) return
    await this._submitRegister()
  },

  async _submitPassword() {
    const loginName = (this.data.loginName || '').trim()
    const password = this.data.password || ''
    if (loginName.length < 2) {
      this.setData({ err: '账户名至少 2 个字符' })
      return
    }
    if (password.length < 6) {
      this.setData({ err: '密码至少 6 位' })
      return
    }
    this.setData({ busy: true, err: '' })
    try {
      await api.loginWithPassword(loginName, password)
      this._goHome()
    } catch (e) {
      const msg = e && e.message ? e.message : '登录失败'
      this.setData({ err: msg.includes('Invalid login') ? '账号或密码错误' : msg })
    } finally {
      this.setData({ busy: false })
    }
  },

  async _submitSmsLogin() {
    const mobile = String(this.data.loginPhone || '').replace(/\D/g, '')
    const smsCode = String(this.data.loginSmsCode || '').trim()
    if (!tenantAuthApi.isCnMobileValid(mobile)) {
      this.setData({ err: '请输入正确的 11 位手机号' })
      return
    }
    if (!/^\d{6}$/.test(smsCode)) {
      this.setData({ err: '请输入 6 位验证码' })
      return
    }
    if (!tenantAuthApi.apiRoot()) {
      this.setData({ err: '未配置 MERCHANT_API_BASE_URL，无法使用短信登录' })
      return
    }
    this.setData({ busy: true, err: '' })
    try {
      const r = await tenantAuthApi.loginWithSmsCode({ phone: mobile, smsCode })
      if (!r.ok || !r.access_token) {
        this.setData({ err: r.message || r.detail || '验证码登录失败' })
        return
      }
      api.persistSession(
        { access_token: r.access_token, refresh_token: r.refresh_token || '' },
        r.loginName || '',
      )
      this._goHome()
    } finally {
      this.setData({ busy: false })
    }
  },

  async _submitRegister() {
    const loginName = (this.data.regLoginName || '').trim()
    const merchantName = (this.data.merchantName || '').trim()
    const phone = String(this.data.phone || '').replace(/\D/g, '')
    const smsCode = String(this.data.smsCode || '').trim()
    const password = this.data.regPassword || ''
    const confirmPassword = this.data.confirmPassword || ''

    if (!tenantAuthApi.isLoginNameValid(loginName)) {
      this.setData({ err: '登录名须为 4–32 位字母或数字' })
      return
    }
    if (!tenantAuthApi.isMerchantShortNameValid(merchantName)) {
      this.setData({ err: '商家简称 2–30 字，支持中文、字母、数字' })
      return
    }
    if (!tenantAuthApi.isCnMobileValid(phone)) {
      this.setData({ err: '请输入正确的 11 位手机号' })
      return
    }
    if (!/^\d{6}$/.test(smsCode)) {
      this.setData({ err: '请输入 6 位验证码' })
      return
    }
    if (password.length < 6) {
      this.setData({ err: '密码至少 6 位' })
      return
    }
    if (password !== confirmPassword) {
      this.setData({ err: '两次输入的密码不一致' })
      return
    }
    if (!tenantAuthApi.apiRoot()) {
      this.setData({ err: '未配置 MERCHANT_API_BASE_URL，无法注册' })
      return
    }

    this.setData({ busy: true, err: '' })
    try {
      const r = await tenantAuthApi.registerMerchantAccount({
        loginName,
        merchantName,
        phone,
        smsCode,
        password,
        confirmPassword,
      })
      if (!r.ok) {
        const msg = r.message || r.detail || '注册失败'
        this.setData({
          err: /已注册|phone_exists/.test(String(msg)) ? '该账号已注册，请返回并登录' : msg,
        })
        return
      }
      this.setData({
        mode: 'login',
        loginMethod: 'password',
        loginName,
        loginPhone: phone,
        password: '',
        infoHint: r.message || '注册成功，请使用登录名与密码登录',
        err: '',
      })
      this._syncModeHint()
    } finally {
      this.setData({ busy: false })
    }
  },

  onBindPhoneInput(e) {
    this.setData({ bindPhone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) })
  },
  onBindSmsCode(e) {
    this.setData({ bindSmsCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) })
  },
  async onSendBindSms() {
    const mobile = String(this.data.bindPhone || '').replace(/\D/g, '')
    if (!tenantAuthApi.isCnMobileValid(mobile)) {
      this.setData({ err: '请输入正确的 11 位手机号' })
      return
    }
    this.setData({ bindSmsSending: true, err: '' })
    try {
      const r = await tenantAuthApi.sendAuthSms(mobile)
      if (!r.ok) {
        this.setData({ err: r.message || '验证码发送失败' })
        return
      }
      this._startCooldown('bindSmsCooldown', 'bind')
      if (r.devCode) this.setData({ bindSmsCode: r.devCode })
    } finally {
      this.setData({ bindSmsSending: false })
    }
  },
  onBindBack() {
    this.setData({ bindMergeToken: '', bindMergeMsg: '', bindNeedCode: false, bindSmsCode: '', err: '' })
  },
  async onConfirmBindPhone() {
    const mobile = String(this.data.bindPhone || '').replace(/\D/g, '')
    const smsCode = String(this.data.bindSmsCode || '').trim()
    if (!tenantAuthApi.isCnMobileValid(mobile)) {
      this.setData({ err: '请输入正确的 11 位手机号' })
      return
    }
    this.setData({ busy: true, err: '' })
    try {
      if (this.data.bindMergeToken) {
        if (!/^\d{6}$/.test(smsCode)) {
          this.setData({ err: '请输入 6 位验证码' })
          return
        }
        const r = await tenantAuthApi.postAuthIdentity({
          action: 'merge_confirm',
          mergeToken: this.data.bindMergeToken,
          smsCode,
        })
        if (!r.ok) {
          this.setData({ err: r.message || '加入失败' })
          return
        }
        if (r.access_token) {
          api.persistSession(
            { access_token: r.access_token, refresh_token: r.refresh_token || '' },
            r.loginName || '',
          )
        }
        this.setData({ showBindPhone: false, bindMergeToken: '', bindNeedCode: false })
        this._goHome()
        return
      }
      if (!this.data.bindNeedCode) {
        const r = await tenantAuthApi.postAuthIdentity({
          action: 'probe_contact',
          phone: mobile,
          access_token: this.data.bindAccessToken,
        })
        if (r.error === 'account_exists_merge' && r.mergeToken) {
          this.setData({
            bindMergeToken: r.mergeToken,
            bindMergeMsg: r.message || '已有该账号，是否确定合并？',
            bindSmsCode: '',
            bindNeedCode: true,
          })
          return
        }
        if (!r.ok) {
          this.setData({ err: r.message || '检测失败' })
          return
        }
        this.setData({ bindNeedCode: true, bindSmsCode: '' })
        return
      }
      if (!/^\d{6}$/.test(smsCode)) {
        this.setData({ err: '请输入 6 位验证码' })
        return
      }
      const r = await tenantAuthApi.postAuthIdentity({
        action: 'bind_contact',
        phone: mobile,
        smsCode,
        access_token: this.data.bindAccessToken,
      })
      if (r.error === 'account_exists_merge' && r.mergeToken) {
        this.setData({
          bindMergeToken: r.mergeToken,
          bindMergeMsg: r.message || '已有该账号，是否确定合并？',
          bindSmsCode: '',
          bindNeedCode: true,
        })
        return
      }
      if (!r.ok) {
        this.setData({ err: r.message || '绑定失败' })
        return
      }
      this.setData({ showBindPhone: false, bindNeedCode: false })
      this._goHome()
    } finally {
      this.setData({ busy: false })
    }
  },
})
