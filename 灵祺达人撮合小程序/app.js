const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')
const mpAuth = require('./utils/mpAccountAuth.js')

App({
  globalData: {
    chatBadge: 0,
  },
  onLaunch() {
    chatBadgeWatcher.start()
    if (!mpAuth.isLoggedIn()) {
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
