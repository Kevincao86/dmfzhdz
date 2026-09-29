const auth = require('../../../utils/auth.js')

function readIds(account) {
  const ids = account && account.identities
  if (ids && typeof ids === 'object') return ids
  const login = String((account && account.loginName) || '')
  const phone = /^1\d{10}$/.test(login)
  const email = !phone && login.indexOf('@') > 0
  return {
    wechat: !!(account && account.openid),
    douyin: !!(account && (account.dyOpenid || account.dy_openid)),
    phone,
    email,
    phoneMasked: phone ? `${login.slice(0, 3)}****${login.slice(-4)}` : '',
    emailMasked: email ? `${login.slice(0, 1)}***${login.slice(login.indexOf('@'))}` : '',
  }
}

Page({
  data: {
    ids: readIds(null),
    kind: '',
    value: '',
    code: '',
    cooldown: 0,
    busy: false,
    err: '',
    hint: '',
  },

  onShow() {
    if (!auth.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    void this.reload()
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer)
  },

  async reload() {
    try {
      const data = await auth.refreshSession()
      const account = (data && data.account) || auth.readAccount()
      this.setData({ ids: readIds(account) })
    } catch (_) {
      this.setData({ ids: readIds(auth.readAccount()) })
    }
  },

  onPick(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ err: '', hint: '' })
    if (id === 'wechat') {
      if (this.data.ids.wechat) {
        this.setData({ hint: '微信已绑定', kind: '' })
        return
      }
      void this.bindWechat()
      return
    }
    if (id === 'douyin') {
      this.setData({
        kind: '',
        hint: this.data.ids.douyin
          ? '抖音已绑定'
          : '请在电脑端星选登录页使用抖音扫码，并用同一手机号或邮箱完成绑定',
      })
      return
    }
    this.setData({ kind: id, value: '', code: '' })
  },

  async bindWechat() {
    wx.showLoading({ title: '绑定微信', mask: true })
    try {
      const data = await auth.bindWxOpenId()
      wx.hideLoading()
      this.setData({ ids: readIds((data && data.account) || auth.readAccount()), hint: '微信已绑定' })
    } catch (e) {
      wx.hideLoading()
      this.setData({ err: String((e && (e.message || e.errMsg)) || '微信绑定失败').slice(0, 40) })
    }
  },

  onValue(e) {
    const raw = String((e.detail && e.detail.value) || '')
    this.setData({
      value: this.data.kind === 'phone' ? raw.replace(/\D/g, '').slice(0, 11) : raw,
      err: '',
    })
  },

  onCode(e) {
    this.setData({ code: String((e.detail && e.detail.value) || '').replace(/\D/g, '').slice(0, 6), err: '' })
  },

  startCooldown() {
    if (this._timer) clearInterval(this._timer)
    this.setData({ cooldown: 60 })
    this._timer = setInterval(() => {
      const n = this.data.cooldown - 1
      if (n <= 0) {
        clearInterval(this._timer)
        this._timer = null
        this.setData({ cooldown: 0 })
        return
      }
      this.setData({ cooldown: n })
    }, 1000)
  },

  async onSend() {
    const kind = this.data.kind
    if (kind === 'phone' && !/^1\d{10}$/.test(this.data.value)) {
      this.setData({ err: '请输入有效手机号' })
      return
    }
    if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.data.value.trim())) {
      this.setData({ err: '请输入有效邮箱' })
      return
    }
    try {
      if (kind === 'phone') await auth.sendRegisterSms(this.data.value)
      else await auth.sendEmailCode(this.data.value.trim())
      this.startCooldown()
    } catch (e) {
      this.setData({ err: String((e && e.message) || '验证码发送失败').slice(0, 40) })
    }
  },

  async onSubmit() {
    if (this.data.busy) return
    if (!/^\d{6}$/.test(this.data.code)) {
      this.setData({ err: '请输入 6 位验证码' })
      return
    }
    const ids = this.data.ids || {}
    const platform = ids.douyin && !ids.wechat ? 'dy' : 'wx'
    this.setData({ busy: true, err: '' })
    try {
      const data =
        this.data.kind === 'phone'
          ? await auth.bindPhoneSms({ phone: this.data.value, smsCode: this.data.code, platform })
          : await auth.bindEmailLogin({
              email: this.data.value.trim(),
              emailCode: this.data.code,
              platform,
            })
      const next = readIds((data && data.account) || auth.readAccount())
      const key = this.data.kind === 'phone' ? 'phone' : 'email'
      if (!next[key]) {
        this.setData({
          busy: false,
          ids: next,
          err: '该账号已有另一个登录名。同一手机号或邮箱会把微信、抖音并到已有账号。',
        })
        return
      }
      this.setData({
        busy: false,
        ids: next,
        kind: '',
        value: '',
        code: '',
        hint: '已绑定。同一手机号或邮箱下的微信、抖音会并成一个账号。',
      })
    } catch (e) {
      this.setData({ busy: false, err: String((e && e.message) || '绑定失败').slice(0, 40) })
    }
  },
})
