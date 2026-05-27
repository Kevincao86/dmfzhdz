const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const tenantAuthApi = require('../../utils/tenantAuthApiMp.js')

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
    refreshing: false,
    submitLabel: '进入工作台',
    devSkip: false,
  },

  onLoad() {
    this.setData({ devSkip: devAuth.isDevSkipLogin() })
    this._syncModeHint()
  },

  onUnload() {
    this._clearCooldownTimers()
  },

  onShow() {
    this.setData({ devSkip: devAuth.isDevSkipLogin() })
    try {
      if (wx.getStorageSync('meoo_just_logged_out')) {
        wx.removeStorageSync('meoo_just_logged_out')
        return
      }
    } catch (_) {}
    const token = api.getAccessToken()
    if (!token) return
    if (devAuth.isDevSkipLogin() && token === devAuth.DEV_TOKEN) return
    wx.switchTab({ url: '/pages/agent/agent' })
  },

  onDevPreview() {
    if (!devAuth.isDevSkipLogin()) return
    devAuth.applyDevSession()
    wx.switchTab({ url: '/pages/agent/agent' })
  },

  async onRefreshPage() {
    if (this.data.refreshing) return
    this._clearCooldownTimers()
    this.setData({ busy: false, refreshing: true, err: '', infoHint: '' })
    const token = api.getAccessToken()
    const canEnter =
      token && !(devAuth.isDevSkipLogin() && token === devAuth.DEV_TOKEN)
    try {
      if (canEnter) {
        await this._goHome()
        return
      }
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
    this._loginCdTimer = null
    this._regCdTimer = null
  },

  _startCooldown(field, timerKey) {
    this.setData({ [field]: 60 })
    const key = timerKey === 'login' ? '_loginCdTimer' : '_regCdTimer'
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

  _syncModeHint() {
    const { mode, loginMethod } = this.data
    let modeHint = MODE_HINT.register
    let submitLabel = '确认注册'
    if (mode === 'login') {
      modeHint = loginMethod === 'password' ? MODE_HINT.login_password : MODE_HINT.login_sms
      submitLabel = loginMethod === 'password' ? '进入工作台' : '验证码登录'
    }
    this.setData({ modeHint, submitLabel })
  },

  _clearErr() {
    this.setData({ err: '', infoHint: '' })
  },

  onSwitchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.mode) return
    this._clearErr()
    this.setData({ mode })
    this._syncModeHint()
  },

  onSwitchLoginMethod(e) {
    const loginMethod = e.currentTarget.dataset.method
    if (!loginMethod || loginMethod === this.data.loginMethod) return
    this._clearErr()
    this.setData({ loginMethod })
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
    wx.switchTab({
      url: '/pages/agent/agent',
      fail: () => {
        wx.showToast({ title: '进入工作台失败，请重试', icon: 'none' })
      },
    })
  },

  async onSubmit() {
    if (this.data.mode === 'login' && this.data.loginMethod === 'password') {
      await this._submitPassword()
      return
    }
    if (this.data.mode === 'login') {
      await this._submitSmsLogin()
      return
    }
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
        this.setData({ err: r.message || r.detail || '注册失败' })
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
})
