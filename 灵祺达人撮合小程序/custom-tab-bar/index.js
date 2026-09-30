const userProfile = require('../utils/userProfile.js')
const identityTheme = require('../utils/identityTheme.js')
const { getTabList, promptMembershipUpgrade } = require('../utils/tabBarConfig.js')
const chatBadgeWatcher = require('../utils/chatBadgeWatcher.js')

Component({
  data: {
    selected: 0,
    hidden: false,
    hasCenterFab: false,
    chatBadge: 0,
    lqThemeClass: identityTheme.themeClass(userProfile.readIdentity()),
    list: getTabList(userProfile.readIdentity()),
  },
  lifetimes: {
    attached() {
      this.applyIdentityLayout()
      chatBadgeWatcher.syncBarFromGlobal()
      void chatBadgeWatcher.refreshNow({ minIntervalMs: 12000 })
    },
  },
  pageLifetimes: {
    show() {
      this.applyIdentityLayout()
      chatBadgeWatcher.syncBarFromGlobal()
      void chatBadgeWatcher.refreshNow({ minIntervalMs: 20000 })
    },
  },
  methods: {
    applyIdentityLayout() {
      const identity = userProfile.readIdentity()
      const list = getTabList(identity)
      const hasCenterFab = list.some((item) => item && item.center)
      const lqThemeClass = identityTheme.themeClass(identity)
      const cur = this.data.list || []
      const same =
        cur.length === list.length &&
        cur.every(
          (item, i) =>
            item.pagePath === list[i].pagePath && item.upgradeFeature === list[i].upgradeFeature,
        )
      const patch = {}
      if (this.data.lqThemeClass !== lqThemeClass) patch.lqThemeClass = lqThemeClass
      if (!same || this.data.hasCenterFab !== hasCenterFab) {
        patch.list = list
        patch.hasCenterFab = hasCenterFab
      }
      if (Object.keys(patch).length) this.setData(patch)
    },
    switchTab(e) {
      const idx = Number(e.currentTarget.dataset.index)
      const item = this.data.list[idx]
      if (!item) return
      if (item.navigate) {
        if (item.upgradeFeature) {
          promptMembershipUpgrade(item.upgradeFeature)
          return
        }
        wx.navigateTo({ url: item.pagePath })
        return
      }
      wx.switchTab({ url: item.pagePath })
    },
  },
})
