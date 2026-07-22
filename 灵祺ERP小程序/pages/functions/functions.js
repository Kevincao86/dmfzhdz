const api = require('../../utils/api.js')
const { FUNCTION_SECTIONS, itemUrl } = require('../../utils/menuFunctions.js')
const { buildPartnerFunctionSections } = require('../../utils/menuFunctionsPartner.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')
const merchant = require('../../utils/merchantApi.js')
const mpEdition = require('../../utils/mpAppEdition.js')
const partnerTenant = require('../../utils/partnerTenantMp.js')

function mapSections(raw) {
  return raw.map((sec) => ({
    ...sec,
    cols: sec.layout === 'grid3' ? 3 : sec.layout === 'grid2' ? 2 : 1,
    sectionIconSrc: iconDataUri(sec.tone, sec.sectionIcon),
    items: sec.items.map((it) => ({
      ...it,
      url: itemUrl(it),
      iconSrc: iconDataUri(sec.tone, it.iconKey),
    })),
  }))
}

Page({
  data: {
    sections: [],
    erpLinked: false,
    hubTitle: '商家能力中心',
    hubSub: '店铺 · 商品 · 运营 · AI创作 · 投流 · 线索 · 财务',
  },

  applySections(raw) {
    const edition = mpEdition.getEdition()
    this.setData({
      sections: mapSections(raw),
      erpLinked: merchant.hasMerchantApi(),
      hubTitle: mpEdition.editionHubTitle(edition),
      hubSub: mpEdition.isPartnerEdition()
        ? '客户门店 · 商品 · 星选招募 · AI创作 · 投流 · 财务 · 系统'
        : '店铺 · 商品 · 运营 · AI创作 · 投流 · 线索 · 财务',
    })
  },

  onLoad() {
    void this.reloadMenus()
  },

  async reloadMenus() {
    if (mpEdition.isPartnerEdition()) {
      let isParent = true
      try {
        const profile = await partnerTenant.fetchPartnerProfile()
        isParent = !!(profile && profile.isParent !== false && !profile.isAgent)
      } catch (_) {}
      this.applySections(buildPartnerFunctionSections({ isParent }))
      return
    }
    this.applySections(FUNCTION_SECTIONS)
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
    void this.reloadMenus()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },
})
