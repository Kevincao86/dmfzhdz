const api = require('../../utils/api.js')
const feat = require('../../utils/merchantFeatureApisMp.js')

Page({
  data: {
    address: '',
    city: '',
    spotLabel: '',
    brandName: '',
    busy: false,
    err: '',
    summary: '',
    overall: '',
    verdict: '',
    dimensions: [],
    checklist: [],
    recommendations: [],
    heatNote: '',
  },

  onLoad() {
    const menu = feat.readStoreMenu()
    let displayName = ''
    try {
      displayName = String(wx.getStorageSync('meoo_erp_merchant_display_name') || '').trim()
    } catch (_) {}
    this.setData({ brandName: menu.storeName || displayName })
  },

  onShow() {
    if (!api.isRealAuthed()) {
      api.requireRealAuth('/pages/site-selection/site-selection')
    }
  },

  onAddress(e) {
    this.setData({ address: e.detail.value })
  },
  onCity(e) {
    this.setData({ city: e.detail.value })
  },
  onSpot(e) {
    this.setData({ spotLabel: e.detail.value })
  },
  onBrand(e) {
    this.setData({ brandName: e.detail.value })
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        const address = String(res.address || res.name || '').trim()
        const name = String(res.name || '').trim()
        this.setData({
          address: address || this.data.address,
          spotLabel: name || this.data.spotLabel,
        })
      },
      fail: () => {
        wx.showToast({ title: '未选择位置', icon: 'none' })
      },
    })
  },

  onAnalyze() {
    const address = String(this.data.address || '').trim()
    if (!address) {
      wx.showToast({ title: '请填写选址地址', icon: 'none' })
      return
    }
    this.setData({
      busy: true,
      err: '',
      summary: '',
      overall: '',
      verdict: '',
      dimensions: [],
      checklist: [],
      recommendations: [],
      heatNote: '',
    })
    void (async () => {
      const r = await feat.runSiteSelection({
        address,
        city: String(this.data.city || '').trim() || undefined,
        spotLabel: String(this.data.spotLabel || '').trim() || undefined,
        brandName: String(this.data.brandName || '').trim() || undefined,
        industryPath: feat.readIndustryPath() || undefined,
        margins: feat.readMargins(),
      })
      if (!r.ok) {
        this.setData({ busy: false, err: r.message || '评估失败' })
        return
      }
      const score = r.score || {}
      const dims = Array.isArray(score.dimensions)
        ? score.dimensions.map((d, i) => ({
            id: `d-${i}`,
            label: String(d.label || d.key || '维度'),
            score: d.score,
            note: String(d.note || ''),
          }))
        : []
      const heat = r.footTrafficHeat || {}
      const heatNote = heat.summary || heat.level || heat.note || ''
      const recommendations = (r.recommendations || []).map((x, i) => ({
        id: `r-${i}`,
        title: String(x.title || x.name || x.label || '推荐点位').trim(),
        note: String(x.note || x.reason || x.summary || '').trim(),
      }))
      this.setData({
        busy: false,
        summary: r.summary || '',
        overall: score.overall != null ? String(score.overall) : '—',
        verdict: String(score.verdict || ''),
        dimensions: dims,
        checklist: r.checklist || [],
        recommendations,
        heatNote: String(heatNote || ''),
      })
    })()
  },
})
