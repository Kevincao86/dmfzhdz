const api = require('../../utils/api.js')
const { FUNCTION_SECTIONS, itemUrl } = require('../../utils/menuFunctions.js')
const merchant = require('../../utils/merchantApi.js')

Page({
  data: {
    sections: [],
    erpLinked: false,
  },

  onLoad() {
    const sections = FUNCTION_SECTIONS.map((sec) => ({
      ...sec,
      items: sec.items.map((it) => ({
        ...it,
        url: itemUrl(it),
      })),
    }))
    this.setData({
      sections,
      erpLinked: merchant.hasMerchantApi(),
    })
  },

  onShow() {
    if (!api.canAccessTabBar()) {
      api.goLogin()
      return
    }
    try {
      const app = getApp()
      if (app && typeof app.syncMerchantSession === 'function') void app.syncMerchantSession()
    } catch (_) {}
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

})
