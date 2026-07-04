const userProfile = require('../../utils/userProfile.js')
const auth = require('../../utils/auth.js')
const prFeatureAccess = require('../../utils/prFeatureAccess.js')
const identityTheme = require('../../utils/identityTheme.js')
const mpFeatureFlags = require('../../utils/mpFeatureFlags.js')
const { buildAiAddonsFromAccount } = require('./addonCards.js')

Page({
  behaviors: [require('../../behaviors/identityTheme')],
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
    const perm = e.currentTarget.dataset.perm
    if (perm && !prFeatureAccess.canUseAddonPerm(auth.readAccount(), perm)) {
      wx.showModal({
        title: '功能待开通',
        content: '该增值功能需由灵祺运营在后台开通后方可使用。如有合作意向请联系灵祺运营。',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    if (!this.data.addonsEnabled) {
      wx.showModal({
        title: '增值服务待开通',
        content:
          '短视频 AI、AI 文章与话题、数字人口播需由灵祺运营在后台开通后方可使用。如有合作意向请联系灵祺运营。',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.navigateTo({ url })
  },
  onContactOps() {
    wx.navigateTo({ url: '/pages/mine-support/mine-support' })
  },
})
