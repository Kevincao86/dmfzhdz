const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const merchant = require('../../utils/merchantApi.js')
const dashboardMp = require('../../utils/dashboardMp.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')

const RANGE_TABS = [
  { id: 'today', label: '今日', apiRange: 'realtime' },
  { id: 'day7', label: '7日', apiRange: 'day7' },
  { id: 'day30', label: '30日', apiRange: 'day30' },
]

const EMPTY_KPIS = [
  { label: '成交额', value: '—', delta: '', deltaUp: true, iconKey: 'shop' },
  { label: '核销单', value: '—', delta: '', deltaUp: true, iconKey: 'list' },
  { label: '好评率', value: '—', delta: '', deltaUp: true, iconKey: 'star' },
  { label: '在途招募', value: '—', delta: '', deltaUp: true, iconKey: 'user' },
]

/** 仅 DEV_SKIP 预览模式使用 */
const PREVIEW_BY_RANGE = {
  today: {
    kpis: [
      { label: '成交额', value: '¥12,480', delta: '较昨日 +12.5%', deltaUp: true, iconKey: 'shop' },
      { label: '核销单', value: '326', delta: '较昨日 +8.3%', deltaUp: true, iconKey: 'list' },
      { label: '好评率', value: '4.8', delta: '较昨日 +0.2', deltaUp: true, iconKey: 'star' },
      { label: '在途招募', value: '18', delta: '较昨日 +2', deltaUp: true, iconKey: 'user' },
    ],
  },
  day7: {
    kpis: [
      { label: '成交额', value: '¥86,320', delta: '较上周期 +9.1%', deltaUp: true, iconKey: 'shop' },
      { label: '核销单', value: '2,148', delta: '较上周期 +6.4%', deltaUp: true, iconKey: 'list' },
      { label: '好评率', value: '4.7', delta: '较上周期 +0.1', deltaUp: true, iconKey: 'star' },
      { label: '在途招募', value: '24', delta: '较上周期 +5', deltaUp: true, iconKey: 'user' },
    ],
  },
  day30: {
    kpis: [
      { label: '成交额', value: '¥328,600', delta: '较上周期 +15.2%', deltaUp: true, iconKey: 'shop' },
      { label: '核销单', value: '8,926', delta: '较上周期 +11.8%', deltaUp: true, iconKey: 'list' },
      { label: '好评率', value: '4.8', delta: '较上周期 +0.3', deltaUp: true, iconKey: 'star' },
      { label: '在途招募', value: '31', delta: '较上周期 +7', deltaUp: true, iconKey: 'user' },
    ],
  },
}

function enrichKpis(kpis) {
  return kpis.map((k) => ({
    ...k,
    iconSrc: iconDataUri('cyan', k.iconKey),
  }))
}

Page({
  data: {
    loading: false,
    range: 'today',
    rangeTabs: RANGE_TABS,
    heroIconSrc: iconDataUri('cyan', 'shop'),
    kpis: enrichKpis(EMPTY_KPIS),
    usePreview: false,
    chartEmpty: true,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    if (!api.canAccessPage()) {
      api.goLogin()
      return
    }
    void this.loadDash()
  },

  onRangeTap(e) {
    const range = e.currentTarget.dataset.id
    if (!range || range === this.data.range) return
    this.setData({ range })
    void this.loadDash()
  },

  async loadDash() {
    const tab = RANGE_TABS.find((t) => t.id === this.data.range) || RANGE_TABS[0]
    const previewPack = PREVIEW_BY_RANGE[tab.id] || PREVIEW_BY_RANGE.today

    if (devAuth.isDevSkipLogin()) {
      this.setData({
        loading: false,
        usePreview: true,
        kpis: enrichKpis(previewPack.kpis),
        chartEmpty: true,
      })
      return
    }

    if (!merchant.hasMerchantApi()) {
      this.setData({
        loading: false,
        usePreview: false,
        kpis: enrichKpis(EMPTY_KPIS),
        chartEmpty: true,
      })
      return
    }

    this.setData({ loading: true })
    const d = await dashboardMp.fetchAggregateDashboard(tab.apiRange)
    if (!d.connected) {
      this.setData({
        loading: false,
        usePreview: false,
        kpis: enrichKpis(EMPTY_KPIS),
        chartEmpty: true,
      })
      return
    }

    const kpis = enrichKpis([
      {
        label: '成交额',
        value: dashboardMp.formatCurrencyYuan(d.totalRevenue),
        delta: '',
        deltaUp: true,
        iconKey: 'shop',
      },
      {
        label: '核销单',
        value: d.totalOrders ? String(d.totalOrders) : '0',
        delta: '',
        deltaUp: true,
        iconKey: 'list',
      },
      {
        label: '好评率',
        value: d.conversionRate ? String(d.conversionRate) : '—',
        delta: '',
        deltaUp: true,
        iconKey: 'star',
      },
      {
        label: '在途招募',
        value: d.fansGrowth ? String(d.fansGrowth) : '—',
        delta: '',
        deltaUp: true,
        iconKey: 'user',
      },
    ])

    this.setData({
      loading: false,
      usePreview: false,
      kpis,
      chartEmpty: true,
    })
  },
})
