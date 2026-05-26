const devAuth = require('./utils/devAuth.js')
const sessionSync = require('./utils/merchantSessionSyncMp.js')

App({
  onLaunch() {
    const token = String(wx.getStorageSync('meoo_access_token') || '').trim()
    if (token) {
      this.globalData.accessToken = token
      if (!devAuth.isDevSession()) void sessionSync.syncFromCloud()
    } else {
      this.globalData.accessToken = null
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
    const t = wx.getStorageSync('meoo_access_token')
    if (!t) {
      const api = require('./utils/api.js')
      api.openLoginPage()
      return false
    }
    this.globalData.accessToken = t
    return true
  },
})
