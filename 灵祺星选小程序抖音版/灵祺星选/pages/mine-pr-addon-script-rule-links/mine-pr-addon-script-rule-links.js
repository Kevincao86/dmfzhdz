const groupsMod = require('../../utils/platformScriptReviewRuleLinks.js')

Page({
  behaviors: [require('../../behaviors/identityTheme')],
  data: {
    groups: groupsMod.PLATFORM_SCRIPT_REVIEW_RULE_GROUPS || [],
  },
  onOpenLink(e) {
    const url = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim()
    if (!/^https?:\/\//i.test(url)) {
      wx.showToast({ title: '链接无效', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/web-link/web-link?url=${encodeURIComponent(url)}&embed=1`,
    })
  },
})
