const api = require('../../utils/api.js')

Page({
  data: {
    loginName: '',
    password: '',
    err: '',
    busy: false,
  },
  onShow() {
    if (api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/home/home' })
    }
  },
  onLoginName(e) {
    this.setData({ loginName: e.detail.value, err: '' })
  },
  onPassword(e) {
    this.setData({ password: e.detail.value, err: '' })
  },
  async onSubmit() {
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
      wx.redirectTo({ url: '/pages/home/home' })
    } catch (e) {
      const msg = e && e.message ? e.message : '登录失败'
      this.setData({ err: msg })
    } finally {
      this.setData({ busy: false })
    }
  },
})
