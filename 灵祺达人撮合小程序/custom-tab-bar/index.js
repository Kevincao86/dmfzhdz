const userProfile = require('../utils/userProfile.js')
const { getTabList } = require('../utils/tabBarConfig.js')
const chatBadgeWatcher = require('../utils/chatBadgeWatcher.js')

Component({
  data: {
    selected: 0,
    hidden: false,
    hasCenterFab: false,
    chatBadge: 0,
    list: getTabList(userProfile.readIdentity()),
  },
  lifetimes: {
    attached() {
      this.applyIdentityLayout()
      chatBadgeWatcher.syncBarFromGlobal()
      void chatBadgeWatcher.refreshNow()
    },
  },
  pageLifetimes: {
    show() {
      this.applyIdentityLayout()
      chatBadgeWatcher.syncBarFromGlobal()
      void chatBadgeWatcher.refreshNow()
    },
  },
  methods: {
    applyIdentityLayout() {
      const list = getTabList(userProfile.readIdentity())
      const hasCenterFab = list.some((item) => item && item.center)
      const cur = this.data.list || []
      const same =
        cur.length === list.length && cur.every((item, i) => item.pagePath === list[i].pagePath)
      if (!same || this.data.hasCenterFab !== hasCenterFab) {
        this.setData({ list, hasCenterFab })
      }
    },
    switchTab(e) {
      const idx = Number(e.currentTarget.dataset.index)
      const item = this.data.list[idx]
      if (!item) return
      wx.switchTab({ url: item.pagePath })
    },
  },
})
