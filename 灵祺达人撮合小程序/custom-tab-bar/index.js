const userProfile = require('../utils/userProfile.js')
const identityTheme = require('../utils/identityTheme.js')
const { getTabList } = require('../utils/tabBarConfig.js')
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
      identityTheme.syncTabBar()
      chatBadgeWatcher.syncBarFromGlobal()
      // 冷启动拉一次角标即可；勿在每次 Tab show 全量请求（会导致底栏切换卡顿）
      void chatBadgeWatcher.refreshNow({ minIntervalMs: 0 })
    },
  },
  pageLifetimes: {
    show() {
      this.applyIdentityLayout()
      identityTheme.syncTabBar()
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
        cur.length === list.length && cur.every((item, i) => item.pagePath === list[i].pagePath)
      const patch = { lqThemeClass }
      if (!same || this.data.hasCenterFab !== hasCenterFab) {
        patch.list = list
        patch.hasCenterFab = hasCenterFab
      }
      this.setData(patch)
    },
    switchTab(e) {
      const idx = Number(e.currentTarget.dataset.index)
      const item = this.data.list[idx]
      if (!item) return
      wx.switchTab({ url: item.pagePath })
    },
  },
})
