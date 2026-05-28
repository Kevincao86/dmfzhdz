const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')

App({
  globalData: {
    chatBadge: 0,
  },
  onLaunch() {
    chatBadgeWatcher.start()
  },
  onShow() {
    void chatBadgeWatcher.refreshNow()
  },
})
