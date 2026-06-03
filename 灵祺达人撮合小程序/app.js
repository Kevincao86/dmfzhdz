const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')
const auth = require('./utils/auth.js')
const config = require('./utils/config.js')

App({
  globalData: {
    chatBadge: 0,
  },
  onLaunch() {
    if (config.MP_USE_CLOUD_PROXY && wx.cloud) {
      const env = String(config.MP_CLOUD_ENV || '').trim()
      if (env) {
        wx.cloud.init({ env, traceUser: true })
      } else {
        console.warn('[mp] MP_USE_CLOUD_PROXY 已开但 MP_CLOUD_ENV 为空，见 备案过渡-云开发代理.md')
      }
    }
    chatBadgeWatcher.start()
    if (!auth.isLoggedIn()) {
      const pages = getCurrentPages()
      const route = pages.length ? pages[pages.length - 1].route : ''
      if (route !== 'pages/login/login') {
        wx.reLaunch({ url: '/pages/login/login' })
      }
    }
  },
  onShow() {
    void chatBadgeWatcher.refreshNow()
  },
})
