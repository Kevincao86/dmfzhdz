App({
  onLaunch() {
    const token = wx.getStorageSync('meoo_access_token')
    if (token) {
      this.globalData.accessToken = token
    }
  },
  globalData: {
    accessToken: null,
  },
  /** 供页面校验登录态 */
  ensureAuthed() {
    const t = wx.getStorageSync('meoo_access_token')
    if (!t) {
      wx.redirectTo({ url: '/pages/login/login' })
      return false
    }
    return true
  },
})
