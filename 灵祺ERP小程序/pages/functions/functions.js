const api = require('../../utils/api.js')
const { FUNCTION_SECTIONS, itemUrl } = require('../../utils/menuFunctions.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')
const { assetUrl } = require('../../utils/mpStaticAssets.js')
const merchant = require('../../utils/merchantApi.js')

Page({
  data: {
    sections: [],
    erpLinked: false,
    guestMode: false,
    logoSrc: assetUrl('logo.png'),
  },

  onLoad() {
    api.enterGuestBrowse()
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
      guestMode: !api.isRealAuthed(),
      logoSrc: assetUrl('logo.png'),
    })
  },

  onShow() {
    // 审核：功能首页可未登录浏览，不强制跳登录
    api.enterGuestBrowse()
    this.setData({ guestMode: !api.isRealAuthed() })
    if (api.isRealAuthed()) {
      try {
        const app = getApp()
        if (app && typeof app.syncMerchantSession === 'function') void app.syncMerchantSession({ force: true })
      } catch (_) {}
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  onGoLogin() {
    api.requireRealAuth('/pages/functions/functions')
  },
})
