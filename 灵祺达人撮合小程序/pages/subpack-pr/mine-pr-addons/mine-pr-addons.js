const userProfile = require('../../../utils/userProfile.js')
const auth = require('../../../utils/auth.js')
const prFeatureAccess = require('../../../utils/prFeatureAccess.js')
const identityTheme = require('../../../utils/identityTheme.js')
const mpFeatureFlags = require('../../../utils/mpFeatureFlags.js')
const upgradeHint = require('../../../utils/mpAddonUpgradeHint.js')
const { buildAiAddonsFromAccount } = require('./addonCards.js')

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    addonsEnabled: false,
    aiAddons: [],
  },
  onShow() {
    if (!mpFeatureFlags.ADDONS_NAV_VISIBLE) {
      wx.switchTab({ url: '/pages/mine/mine' })
      return
    }
    const identity = userProfile.readIdentity()
    if (!['pr', 'talent', 'shoot', 'edit'].includes(identity)) {
      wx.switchTab({ url: '/pages/mine/mine' })
      return
    }
    identityTheme.applyChrome(identity === 'pr' ? 'pr' : identity, { animate: false })
    this.refresh()
  },
  refresh() {
    const account = auth.readAccount()
    const access = prFeatureAccess.readAccountPrFeatureAccess(account)
    this.setData({
      addonsEnabled: access.any,
      aiAddons: buildAiAddonsFromAccount(account),
    })
  },
  onAddonTap(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const perm = e.currentTarget.dataset.perm
    const title = e.currentTarget.dataset.title || '该功能'
    const account = auth.readAccount()
    if (perm && !prFeatureAccess.canUseAddonPerm(account, perm)) {
      upgradeHint.showUpgradeModal(account, perm, title)
      return
    }
    wx.navigateTo({
      url,
      fail: (err) => {
        wx.showToast({
          title: (err && err.errMsg) || '页面打开失败',
          icon: 'none',
        })
      },
    })
  },
  onContactOps() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-support/mine-support' })
  },
})
