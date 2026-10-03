const api = require('../../utils/api.js')
const { FUNCTION_SECTIONS, itemUrl } = require('../../utils/menuFunctions.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')
const { assetUrl } = require('../../utils/mpStaticAssets.js')
const merchant = require('../../utils/merchantApi.js')
const erpNav = require('../../utils/erpNavMp.js')

Page({
  data: {
    sections: [],
    erpLinked: false,
    guestMode: false,
    logoSrc: assetUrl('logo.png'),
    statusBarHeight: 20,
  },

  onLoad() {
    let statusBarHeight = 20
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      statusBarHeight = info.statusBarHeight || 20
    } catch (_) {}
    const sections = FUNCTION_SECTIONS.map((sec) => ({
      ...sec,
      cols: 4,
      sectionIconSrc: iconDataUri(sec.tone, sec.sectionIcon),
      items: sec.items.map((it) => ({
        ...it,
        url: itemUrl(it),
        iconSrc: iconDataUri(sec.tone, it.iconKey),
      })),
    }))
    this.setData({
      sections,
      statusBarHeight,
      erpLinked: merchant.hasMerchantApi(),
      guestMode: !api.isRealAuthed(),
      logoSrc: assetUrl('logo.png'),
    })
  },

  onShow() {
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

  onOpenCell(e) {
    erpNav.openUrl(e.currentTarget.dataset.url)
  },

  onGoLogin() {
    api.requireRealAuth('/pages/functions/functions')
  },
})
