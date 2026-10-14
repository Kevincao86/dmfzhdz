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
    editing: false,
    value: '',
    code: '',
    cooldown: 0,
    busy: false,
    err: '',
    hint: '',
    mergeOpen: false,
    mergeLabel: '',
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
          : '请在电脑端星选「账号绑定」里扫码。若该抖音已有账号，扫码验证后会请你确认是否合并到当前账号',
      })
      return
    }
    this.setData({ kind: id, editing: false, value: '', code: '' })
  },

  onStartRebind() {
    this.setData({ editing: true, value: '', code: '', err: '', hint: '' })
  },

  async bindWechat(merge) {
    wx.showLoading({ title: merge ? '验证微信' : '绑定微信', mask: true })
    try {
      const data = await auth.bindWxOpenId({ merge: !!merge })
      wx.hideLoading()
      this.setData({
        ids: readIds((data && data.account) || auth.readAccount()),
        hint: merge ? '已合并到当前账号，对方微信账号已隐藏' : '微信已绑定',
        err: '',
      })
    } catch (e) {
      wx.hideLoading()
      const msg = String((e && (e.message || e.errMsg)) || '微信绑定失败')
      if (!merge && /已有账号/.test(msg)) {
        wx.showModal({
          title: '合并账号',
          content: '该微信已有账号，请确认是否合并到当前登录账号。确认后会再次验证微信，通过后才合并。',
          confirmText: '确认合并',
          success: (r) => {
            if (r.confirm) void this.bindWechat(true)
          },
        })
        return
      }
      this.setData({ err: msg.slice(0, 40) })
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

  onMergeCancel() {
    this.setData({ mergeOpen: false, mergeLabel: '', code: '', err: '' })
  },

  async onSubmit() {
    if (this.data.busy) return
    const ids = this.data.ids || {}
    const platform = ids.douyin && !ids.wechat ? 'dy' : 'wx'
    const replacing = !!this.data.editing
    const kind = this.data.kind
    if (!replacing && !this.data.mergeOpen) {
      if (kind === 'phone' && !/^1\d{10}$/.test(this.data.value)) {
        this.setData({ err: '请输入有效手机号' })
        return
      }
      if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.data.value.trim())) {
        this.setData({ err: '请输入有效邮箱' })
        return
      }
      try {
        const probe = await auth.bindConflictCheck(kind, kind === 'email' ? this.data.value.trim() : this.data.value)
        if (probe && probe.conflict) {
          const label = probe.label || (kind === 'phone' ? '手机号' : '邮箱')
          wx.showModal({
            title: '合并账号',
            content: `该${label}已有账号，请确认是否合并到当前登录账号。`,
            confirmText: '确认合并',
            success: (r) => {
              if (!r.confirm) return
              this.setData({
                mergeOpen: true,
                mergeLabel: label,
                code: '',
                err: '',
                hint: '',
              })
            },
          })
          return
        }
      } catch (e) {
        this.setData({ err: String((e && e.message) || '暂时无法确认该账号').slice(0, 40) })
        return
      }
    }
    if (!/^\d{6}$/.test(this.data.code)) {
      this.setData({ err: '请输入 6 位验证码' })
      return
    }
    const merging = !!this.data.mergeOpen
    this.setData({ busy: true, err: '' })
    try {
      const data = replacing
        ? kind === 'phone'
          ? await auth.rebindPhoneSms({ phone: this.data.value, smsCode: this.data.code })
          : await auth.rebindEmailLogin({ email: this.data.value.trim(), emailCode: this.data.code })
        : kind === 'phone'
          ? await auth.bindPhoneSms({
              phone: this.data.value,
              smsCode: this.data.code,
              platform,
              merge: merging,
            })
          : await auth.bindEmailLogin({
              email: this.data.value.trim(),
              emailCode: this.data.code,
              platform,
              merge: merging,
            })
      const next = readIds((data && data.account) || auth.readAccount())
      const key = kind === 'phone' ? 'phone' : 'email'
      if (!next[key]) {
        this.setData({
          busy: false,
          ids: next,
          err: '这个手机号或邮箱已经属于另一个账号，请确认合并或改用那个账号登录。',
        })
        return
      }
      this.setData({
        busy: false,
        ids: next,
        kind: '',
        editing: false,
        value: '',
        code: '',
        mergeOpen: false,
        mergeLabel: '',
        hint: replacing
          ? '已换绑'
          : merging
            ? '已合并到当前账号，对方账号已隐藏'
            : '已绑定。手机号和邮箱可以同时留在这个账号上。',
      })
    } catch (e) {
      this.setData({ busy: false, err: String((e && e.message) || '绑定失败').slice(0, 40) })
    }
  },
})
