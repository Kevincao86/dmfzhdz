const api = require('../../utils/api.js')
const { FUNCTION_SECTIONS, itemUrl } = require('../../utils/menuFunctions.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')
const { assetUrl } = require('../../utils/mpStaticAssets.js')
const merchant = require('../../utils/merchantApi.js')
const dashboardMp = require('../../utils/dashboardMp.js')
const erpNav = require('../../utils/erpNavMp.js')

function buildSections() {
  return FUNCTION_SECTIONS.map((sec) => ({
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

function filterSections(sections, keyword, hallTab) {
  const q = String(keyword || '').trim().toLowerCase()
  return sections
    .filter((sec) => hallTab === 'all' || sec.id === hallTab)
    .map((sec) => {
      if (!q) return sec
      const items = sec.items.filter((it) => {
        const hay = `${it.title} ${it.desc || ''} ${sec.title}`.toLowerCase()
        return hay.indexOf(q) >= 0
      })
      return { ...sec, items }
    })
    .filter((sec) => sec.items && sec.items.length)
}

Page({
  data: {
    sections: [],
    visibleSections: [],
    erpLinked: false,
    guestMode: false,
    logoSrc: assetUrl('logo.png'),
    keyword: '',
    hallTab: 'all',
    deskTitle: '经营工作台',
    deskSub: '与电脑端商家后台同源数据',
    kpiPay: '—',
    kpiOrders: '—',
  },

  onLoad() {
    api.enterGuestBrowse()
    const sections = buildSections()
    this.setData({
      sections,
      visibleSections: filterSections(sections, '', 'all'),
      erpLinked: merchant.hasMerchantApi(),
      guestMode: !api.isRealAuthed(),
      logoSrc: assetUrl('logo.png'),
    })
  },

  onShow() {
    api.enterGuestBrowse()
    this.setData({ guestMode: !api.isRealAuthed() })
    if (api.isRealAuthed()) {
      try {
        const app = getApp()
        if (app && typeof app.syncMerchantSession === 'function') void app.syncMerchantSession({ force: true })
      } catch (_) {}
      void this.loadKpis()
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  applyFilter() {
    this.setData({
      visibleSections: filterSections(this.data.sections, this.data.keyword, this.data.hallTab),
    })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value || '' })
  },

  onSearchConfirm() {
    this.applyFilter()
  },

  onHallTab(e) {
    const tab = e.currentTarget.dataset.tab || 'all'
    this.setData({ hallTab: tab })
    this.applyFilter()
  },

  async loadKpis() {
    if (!merchant.hasMerchantApi()) return
    try {
      const d = await dashboardMp.fetchAggregateDashboard('day7')
      this.setData({
        kpiPay: d.connected ? dashboardMp.formatCurrencyYuan(d.totalRevenue) : '—',
        kpiOrders: d.connected ? String(d.totalOrders || 0) : '—',
        deskSub: d.connected ? '近7日 · 已绑定平台汇总' : '绑定抖音/美团后可同步金额',
      })
    } catch (_) {}
  },

  onOpenCell(e) {
    erpNav.openUrl(e.currentTarget.dataset.url)
  },

  onGoDashboard() {
    erpNav.openUrl('/pages/dashboard/dashboard')
  },

  onGoAgent() {
    erpNav.openUrl('/pages/ai-agent/ai-agent')
  },

  onGoLogin() {
    api.requireRealAuth('/pages/functions/functions')
  },
})
