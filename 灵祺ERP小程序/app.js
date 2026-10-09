const devAuth = require('./utils/devAuth.js')
const sessionSync = require('./utils/merchantSessionSyncMp.js')
const supabaseCfg = require('./utils/supabaseClientConfigMp.js')
const mpDefaultShare = require('./utils/mpDefaultShare.js')

mpDefaultShare.installDefaultShare()

App({
  onLaunch() {
    mpDefaultShare.enableShareMenu()
    void supabaseCfg.bootstrap()
    if (devAuth.isDevSkipLogin()) {
      devAuth.applyDevSession()
    }
    const token = String(wx.getStorageSync('meoo_access_token') || '').trim()
    if (token) {
      this.globalData.accessToken = token
      void supabaseCfg.bootstrap().then(() => {
        const api = require('./utils/api.js')
        return api.ensureFreshAccessToken()
      }).then((fresh) => {
        if (fresh) this.globalData.accessToken = fresh
        if (!devAuth.isDevSession()) void sessionSync.syncFromCloud({ force: true })
      }).catch(() => {
        if (!devAuth.isDevSession()) void sessionSync.syncFromCloud({ force: true })
      })
      // 已登录进入工作台改由登录页开屏海报结束后再跳转
    } else {
      this.globalData.accessToken = null
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
