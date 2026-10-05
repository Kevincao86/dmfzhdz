const auth = require('../../../utils/auth.js')
const mpApiErrors = require('../../../utils/mpApiErrors.js')
const userProfile = require('../../../utils/userProfile.js')
const identityTypes = require('../../../utils/identityTypes.js')
const mpPhoneAuth = require('../../../utils/mpPhoneAuth.js')
const loginLegalAgree = require('../../../utils/loginLegalAgree.js')

const IDENTITY_OPTIONS = [
  { id: 'talent', label: '我是达人', line: '看带货等级，报名商单', file: 'reg-talent.jpg' },
  { id: 'shoot', label: '我是拍摄', line: '接拍摄任务，去看课程', file: 'reg-shoot.jpg' },
  { id: 'edit', label: '我是剪辑', line: '接剪辑任务，交成片', file: 'reg-edit.jpg' },
  { id: 'pr', label: '我是PR', line: '发布招募，对接达人', file: 'reg-pr.jpg' },
]

const DEFAULT_IDENTITY = IDENTITY_OPTIONS[0]

function normalizeEmail(raw) {
  const mail = String(raw || '').trim().toLowerCase()
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(mail)) return ''
  return mail
}

function regNoteText(fromWx, channel) {
  if (fromWx) {
    return channel === 'email'
      ? '微信已登录，请选定身份并绑定邮箱，选定后不可更改'
      : '微信已登录，请选定身份并绑定手机号，选定后不可更改'
  }
  return '用手机号或邮箱作为登录账号。选定后不可更改，登录后自动进入这一版'
}

function navigateAfterRegister() {
  const tabBar = require('../../../utils/tabBar.js')
  tabBar.refreshTabBar()
  wx.switchTab({ url: '/pages/index/index' })
}

function applyIdentity(page, id, restartMotion) {
  const scene = IDENTITY_OPTIONS.find((item) => item.id === id) || DEFAULT_IDENTITY
  page.setData({
    newIdentity: scene.id,
    stageMotion: '',
    stageSrc: `/pages/subpack-signup/images/${scene.file}`,
    stageLine: scene.line,
    sceneLabel: scene.label,
    err: '',
  })
  if (!restartMotion) return
  setTimeout(() => page.setData({ stageMotion: scene.id }), 30)
}

Page({
  data: {
    identityOptions: IDENTITY_OPTIONS,
    newIdentity: DEFAULT_IDENTITY.id,
    stageMotion: '',
    stageSrc: `/pages/subpack-signup/images/${DEFAULT_IDENTITY.file}`,
    stageLine: DEFAULT_IDENTITY.line,
    sceneLabel: DEFAULT_IDENTITY.label,
    phone: '',
    smsCode: '',
    email: '',
    emailCode: '',
    regChannel: 'phone',
    password: '',
    smsSending: false,
    smsCooldown: 0,
    loading: false,
    err: '',
    legalAgreed: false,
    fromWx: false,
    regNote: regNoteText(false, 'phone'),
  },

  onLoad(options) {
    const fromWx =
      (options && options.from === 'wx') || (auth.isLoggedIn() && auth.needsPhoneBind())
    this.setData({
      legalAgreed: loginLegalAgree.readAgreed(),
      fromWx,
      regNote: regNoteText(fromWx, this.data.regChannel),
    })
    applyIdentity(this, DEFAULT_IDENTITY.id, true)
  },

  onUnload() {
    if (this._smsTimer) {
      clearInterval(this._smsTimer)
      this._smsTimer = null
    }
  },

  onPickIdentity(e) {
    const id = e.currentTarget.dataset.id
    if (!identityTypes.isWorkIdentity(id)) return
    applyIdentity(this, id, true)
  },

  onPhone(e) {
    this.setData({ phone: mpPhoneAuth.sanitizePhoneInput(e.detail.value) })
  },
  onSmsCode(e) {
    this.setData({ smsCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) })
  },
  onPassword(e) {
    this.setData({ password: e.detail.value })
  },
  onEmail(e) {
    this.setData({ email: String(e.detail.value || '').trim() })
  },
  onEmailCode(e) {
    this.setData({ emailCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) })
  },
  onPickChannel(e) {
    const id = e.currentTarget.dataset.id === 'email' ? 'email' : 'phone'
    this.setData({
      regChannel: id,
      err: '',
      regNote: regNoteText(this.data.fromWx, id),
    })
  },

  onToggleLegal() {
    const next = !this.data.legalAgreed
    loginLegalAgree.writeAgreed(next)
    this.setData({ legalAgreed: next, err: '' })
  },
  onOpenLegal(e) {
    const doc = e.currentTarget.dataset.doc === 'aup' ? 'aup' : 'privacy'
    wx.navigateTo({ url: `/pages/legal/legal?doc=${doc}` })
  },
  onBackLogin() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.redirectTo({ url: '/pages/login/login' }),
    })
  },

  async onSendSms() {
    const err = mpPhoneAuth.validatePhoneAccount(this.data.phone)
    if (err) {
      this.setData({ err })
      return
    }
    this.setData({ smsSending: true, err: '' })
    try {
      await auth.sendRegisterSms(this.data.phone)
      wx.showToast({ title: '验证码已发送', icon: 'none' })
      this.setData({ smsCooldown: 60 })
      if (this._smsTimer) clearInterval(this._smsTimer)
      this._smsTimer = setInterval(() => {
        const n = this.data.smsCooldown - 1
        if (n <= 0) {
          clearInterval(this._smsTimer)
          this._smsTimer = null
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

  async onSendEmail() {
    const mail = normalizeEmail(this.data.email)
    if (!mail) {
      this.setData({ err: '请输入有效邮箱' })
      return
    }
    this.setData({ smsSending: true, err: '' })
    try {
      await auth.sendEmailCode(mail)
      wx.showToast({ title: '验证码已发送', icon: 'none' })
      this.setData({ smsCooldown: 60 })
      if (this._smsTimer) clearInterval(this._smsTimer)
      this._smsTimer = setInterval(() => {
        const n = this.data.smsCooldown - 1
        if (n <= 0) {
          clearInterval(this._smsTimer)
          this._smsTimer = null
          this.setData({ smsCooldown: 0 })
        } else {
          this.setData({ smsCooldown: n })
        }
      }, 1000)
    } catch (e) {
      this.setData({ err: mpApiErrors.formatMpApiErr(e, '邮箱验证码发送失败') })
    } finally {
      this.setData({ smsSending: false })
    }
  },

  async onRegister() {
    const workId = this.data.newIdentity
    if (!identityTypes.isWorkIdentity(workId)) {
      this.setData({ err: '请先选择身份，选定后不可更改' })
      return
    }
    if (!this.data.legalAgreed) {
      this.setData({ err: '请先勾选并同意《用户协议》和《隐私政策》' })
      return
    }
    const useEmail = this.data.regChannel === 'email'
    const mail = normalizeEmail(this.data.email)
    if (useEmail) {
      if (!mail) {
        this.setData({ err: '请输入有效邮箱' })
        return
      }
      if (!/^\d{6}$/.test(this.data.emailCode)) {
        this.setData({ err: '请输入 6 位邮箱验证码' })
        return
      }
    } else {
      const phoneErr = mpPhoneAuth.validatePhoneAccount(this.data.phone)
      if (phoneErr) {
        this.setData({ err: phoneErr })
        return
      }
      if (!/^\d{6}$/.test(this.data.smsCode)) {
        this.setData({ err: '请输入 6 位验证码' })
        return
      }
    }
    if (String(this.data.password || '').length < 6) {
      this.setData({ err: '密码至少 6 位' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const role = identityTypes.accountRoleForWorkIdentity(workId)
      let account
      if (useEmail && this.data.fromWx && auth.isLoggedIn()) {
        const ensured = await auth.ensureIdentity(role, workId === 'pr' ? undefined : workId)
        const bound = await auth.bindEmailLogin({
          email: mail,
          emailCode: this.data.emailCode,
          platform: 'wx',
        })
        await auth.setLoginCredentials(mail, this.data.password)
        account = (bound && bound.account) || (ensured && ensured.account) || auth.readAccount()
        try {
          const refreshed = await auth.refreshSession()
          account = (refreshed && refreshed.account) || account
        } catch (_) {}
      } else if (useEmail) {
        const data = await auth.emailRegister({
          email: mail,
          emailCode: this.data.emailCode,
          password: this.data.password,
          role,
          workIdentity: workId,
        })
        account = (data && data.account) || auth.readAccount()
      } else if (this.data.fromWx && auth.isLoggedIn()) {
        const ensured = await auth.ensureIdentity(role, workId === 'pr' ? undefined : workId)
        const bound = await auth.bindPhoneSms({
          phone: this.data.phone,
          smsCode: this.data.smsCode,
          platform: 'wx',
        })
        await auth.setLoginCredentials(this.data.phone, this.data.password)
        account = (bound && bound.account) || (ensured && ensured.account) || auth.readAccount()
        try {
          const refreshed = await auth.refreshSession()
          account = (refreshed && refreshed.account) || account
        } catch (_) {}
      } else {
        const data = await auth.phoneRegister({
          phone: this.data.phone,
          smsCode: this.data.smsCode,
          password: this.data.password,
          role,
          workIdentity: workId,
        })
        account = (data && data.account) || auth.readAccount()
      }
      if (account) userProfile.adoptAccountIdentity(account)
      wx.showToast({ title: '注册成功', icon: 'success' })
      navigateAfterRegister()
    } catch (e) {
      this.setData({ err: mpApiErrors.formatMpApiErr(e, '注册失败，请稍后重试') })
    } finally {
      this.setData({ loading: false })
    }
  },
})
