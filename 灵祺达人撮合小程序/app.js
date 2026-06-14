const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')
const auth = require('./utils/auth.js')
const config = require('./utils/config.js')
const mpShare = require('./utils/mpShare.js')

App({
  globalData: {
    chatBadge: 0,
  },
  onLaunch() {
    try {
      mpShare.enableShareMenu()
      mpShare.preloadShareCover()
    } catch (e) {
      console.error('[mp] onLaunch share init', e)
    }
    if (config.MP_USE_CLOUD_PROXY && wx.cloud) {
      const env = String(config.MP_CLOUD_ENV || '').trim()
      if (env) {
        wx.cloud.init({ env, traceUser: true })
      } else {
        console.warn('[mp] MP_USE_CLOUD_PROXY 已开但 MP_CLOUD_ENV 为空，见 备案过渡-云开发代理.md')
      }
    }
    chatBadgeWatcher.start()
    if (auth.isLoggedIn()) {
      try {
        require('./utils/mpAccountClientSync.js').pullAfterLogin()
      } catch (_) {}
    }
  },
  onShow() {
    void chatBadgeWatcher.refreshNow()
    if (auth.isLoggedIn()) {
      auth
        .refreshSession()
        .then(() => {
          try {
            return require('./utils/registryProfileSync.js').pullRegistryProfileAfterLogin()
          } catch (_) {
            return null
          }
        })
        .catch(() => {})
    }
  },
  onError(err) {
    console.error('[mp] onError', err)
  },
})
