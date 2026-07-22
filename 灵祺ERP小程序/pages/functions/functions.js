const api = require('../../utils/api.js')
const { FUNCTION_SECTIONS, itemUrl } = require('../../utils/menuFunctions.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')
const merchant = require('../../utils/merchantApi.js')

Page({
  data: {
    sections: [],
    erpLinked: false,
  },

  onLoad() {
    const sections = FUNCTION_SECTIONS.map((sec) => ({
      ...sec,
      cols: sec.layout === 'grid3' ? 3 : sec.layout === 'grid2' ? 2 : 1,
      sectionIconSrc: iconDataUri(sec.tone, sec.sectionIcon),
      items: sec.items.map((it) => ({
        ...it,
        url: itemUrl(it),
        iconSrc: iconDataUri(sec.tone, it.iconKey),
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
      if (app && typeof app.syncMerchantSession === 'function') void app.syncMerchantSession({ force: true })
    } catch (_) {}
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

})
