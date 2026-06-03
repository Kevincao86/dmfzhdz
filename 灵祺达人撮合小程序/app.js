const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')
const auth = require('./utils/auth.js')

App({
  globalData: {
    chatBadge: 0,
  },
  onLaunch() {
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
