const api = require('../../utils/api.js')

const PROFILE_KEY = 'meoo_merchant_profile_v1'

Page({
  data: {
    avatarUrl: '',
    displayName: '',
    loginName: '',
    phone: '',
    saving: false,
    guestMode: false,
  },

  onLoad() {
    this.hydrate()
  },

  onShow() {
    this.hydrate()
  },

  hydrate() {
    const real = api.isRealAuthed()
    let profile = {}
    try {
      const raw = wx.getStorageSync(PROFILE_KEY)
      profile = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    } catch (_) {
      profile = {}
    }
    let loginName = ''
    let displayName = ''
    try {
      loginName = String(wx.getStorageSync('meoo_login_name') || '').trim()
      displayName = String(
        wx.getStorageSync('meoo_erp_merchant_display_name') || loginName || '',
      ).trim()
    } catch (_) {}
    this.setData({
      guestMode: !real,
      avatarUrl: String(profile.avatarUrl || '').trim(),
      displayName: String(profile.displayName || displayName || '').trim(),
      loginName: loginName || String(profile.loginName || '').trim(),
      phone: String(profile.phone || '').trim(),
    })
  },

  onChooseAvatar(e) {
    const url = e.detail && e.detail.avatarUrl
    if (!url) return
    this.setData({ avatarUrl: url })
  },

  onDisplayName(e) {
    this.setData({ displayName: e.detail.value })
  },

  onNickBlur(e) {
    const nick = String(
      (e.detail && (e.detail.nickname || e.detail.nickName || e.detail.value)) || '',
    ).trim()
    if (nick) this.setData({ displayName: nick })
  },

  onPhone(e) {
    this.setData({ phone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) })
  },

  onGoLogin() {
    api.requireRealAuth('/pages/profile-edit/profile-edit')
  },

  onSave() {
    if (!api.isRealAuthed()) {
      api.requireRealAuth('/pages/profile-edit/profile-edit')
      return
    }
    const displayName = String(this.data.displayName || '').trim()
    if (!displayName) {
      wx.showToast({ title: '请填写昵称 / 商家简称', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const payload = {
        avatarUrl: this.data.avatarUrl,
        displayName,
        loginName: this.data.loginName,
        phone: this.data.phone,
        updatedAt: Date.now(),
      }
      wx.setStorageSync(PROFILE_KEY, payload)
      wx.setStorageSync('meoo_erp_merchant_display_name', displayName)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/mine/mine' }) })
      }, 400)
    } catch (_) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
