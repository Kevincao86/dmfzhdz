const feat = require('../../utils/merchantFeatureApisMp.js')

Page({
  data: {
    storeName: '',
    address: '',
    busy: false,
    err: '',
    summary: '',
    competitors: [],
    suggestions: [],
  },

  onLoad() {
    const menu = feat.readStoreMenu()
    let displayName = ''
    try {
      displayName = String(wx.getStorageSync('meoo_erp_merchant_display_name') || '').trim()
    } catch (_) {}
    this.setData({ storeName: menu.storeName || displayName })
  },

  onStoreName(e) {
    this.setData({ storeName: e.detail.value })
  },
  onAddress(e) {
    this.setData({ address: e.detail.value })
  },

  onAnalyze() {
    const storeName = String(this.data.storeName || '').trim()
    const address = String(this.data.address || '').trim()
    if (!storeName || !address) {
      wx.showToast({ title: '请填写门店名与地址', icon: 'none' })
      return
    }
    this.setData({ busy: true, err: '', summary: '', competitors: [], suggestions: [] })
    void (async () => {
      const menu = feat.readStoreMenu()
      const r = await feat.runCompetitorAnalysis({
        storeName,
        address,
        industryPath: feat.readIndustryPath() || undefined,
        menuSummary: feat.menuSummaryLines(menu.items) || undefined,
        margins: feat.readMargins(),
        analysisMode: 'store',
      })
      if (!r.ok) {
        this.setData({ busy: false, err: r.message || '分析失败' })
        return
      }
      this.setData({
        busy: false,
        summary: r.summary,
        competitors: (r.competitors || []).map((c, i) => ({
          id: `c-${i}`,
          name: String(c.name || c.storeName || '竞品').trim(),
          distance: c.distance || c.distanceText || '',
          priceBand: c.priceBand || c.priceRange || '',
          note: c.note || c.highlight || c.summary || '',
        })),
        suggestions: r.suggestions || [],
      })
    })()
  },
})
