const devAuth = require('./utils/devAuth.js')
const sessionSync = require('./utils/merchantSessionSyncMp.js')

App({
  onLaunch() {
    if (devAuth.isDevSkipLogin()) {
      devAuth.applyDevSession()
      this.globalData.accessToken = devAuth.DEV_TOKEN
      return
    }
    const token = wx.getStorageSync('meoo_access_token')
    if (token) {
      this.globalData.accessToken = token
      void sessionSync.syncFromCloud()
    }
  },
  globalData: {
    accessToken: null,
  },
  /** 与 Web 设置页云端绑定同步（抖音 / 本地推 / 聚光） */
  syncMerchantSession(opts) {
    return sessionSync.syncFromCloud(opts)
  },
  /** 供页面校验登录态 */
  ensureAuthed() {
    if (devAuth.isDevSkipLogin()) {
      devAuth.applyDevSession()
      this.globalData.accessToken = devAuth.DEV_TOKEN
      return true
    }
    const t = wx.getStorageSync('meoo_access_token')
    if (!t) {
      wx.redirectTo({ url: '/pages/login/login' })
      return false
    }
    return true
  },
})
