const devAuth = require('./utils/devAuth.js')
const sessionSync = require('./utils/merchantSessionSyncMp.js')
const supabaseCfg = require('./utils/supabaseClientConfigMp.js')

App({
  onLaunch() {
    void supabaseCfg.bootstrap()
    if (devAuth.isDevSkipLogin()) {
      devAuth.applyDevSession()
    }
    const token = String(wx.getStorageSync('meoo_access_token') || '').trim()
    if (token) {
      this.globalData.accessToken = token
      if (!devAuth.isDevSession()) void sessionSync.syncFromCloud({ force: true })
    } else {
      this.globalData.accessToken = null
      // 审核：冷启动未登录时默认游客浏览，不先进登录页强拦
      try {
        require('./utils/api.js').enterGuestBrowse()
      } catch (_) {}
    }
  },
  globalData: {
    accessToken: null,
  },
  /** 与 Web 设置页云端绑定同步（抖音 / 本地推 / 聚光） */
  syncMerchantSession(opts) {
    return sessionSync.syncFromCloud(opts)
  },
  /** 供页面校验登录态（预览/免登录游览模式下不拦截） */
  ensureAuthed() {
    const api = require('./utils/api.js')
    if (!api.canAccessPage()) {
      api.openLoginPage()
      return false
    }
    const t = api.getAccessToken()
    if (t) this.globalData.accessToken = t
    return true
  },
})
