const api = require('../../utils/api.js')
const feat = require('../../utils/merchantFeatureApisMp.js')
const intelMap = require('../../utils/storeIntelMapMp.js')

function formatRec(x, i) {
  const dist =
    x && x.distanceM != null && Number.isFinite(Number(x.distanceM))
      ? Number(x.distanceM) >= 1000
        ? `约 ${(Number(x.distanceM) / 1000).toFixed(1)} km`
        : `约 ${Math.round(Number(x.distanceM))} m`
      : ''
  const counts = x && x.counts && typeof x.counts === 'object' ? x.counts : {}
  const countLine = [
    counts.competitor != null ? `同业 ${counts.competitor}` : '',
    counts.transit != null ? `交通 ${counts.transit}` : '',
    counts.mall != null ? `商场 ${counts.mall}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    id: `r-${i}`,
    title: String(x.title || x.label || x.name || `荐${x.rank || i + 1}`).trim(),
    score: x.score != null ? `${x.score} 分` : '',
    verdict: String(x.verdict || '').trim(),
    distDir: [dist, x.direction].filter(Boolean).join(' · '),
    address: String(x.address || '').trim(),
    note: String(x.reason || x.note || x.summary || '').trim(),
    countLine,
  }
}

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
    nearbyCompetitors: [],
    heat: null,
    heatNote: '',
    mapSourceLabel: '',
    showMap: false,
    mapLat: 30,
    mapLng: 120,
    markers: [],
    includePoints: [],
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
      nearbyCompetitors: [],
      heat: null,
      heatNote: '',
      mapSourceLabel: '',
      showMap: false,
      markers: [],
      includePoints: [],
    })
    void (async () => {
      const r = await feat.runSiteSelection({
        address,
        city: String(this.data.city || '').trim() || undefined,
        spotLabel: String(this.data.spotLabel || '').trim() || undefined,
        brandName: String(this.data.brandName || '').trim() || undefined,
        industryPath: feat.readIndustryPath() || undefined,
        margins: feat.readMargins(),
        radiusM: 1500,
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
      const heat = intelMap.mapHeat(r.footTrafficHeat)
      const recs = (r.recommendations || []).map(formatRec)
      const nearbyCompetitors = (r.competitors || []).slice(0, 8).map((c, i) => {
        const m = c && c.distanceM
        let dist = ''
        if (m != null && Number.isFinite(Number(m))) {
          dist = Number(m) >= 1000 ? `${(Number(m) / 1000).toFixed(1)} km` : `${Math.round(Number(m))} m`
        }
        return {
          id: `n-${i}`,
          name: String(c.name || '同业').trim(),
          dist,
        }
      })
      const mapPayload = Object.assign({}, r, {
        mapMeta: r.mapMeta || { location: r.location, pois: r.competitors },
        competitors: r.competitors,
      })
      const mapView = intelMap.buildMapView(mapPayload, String(this.data.spotLabel || '预想点位').trim() || '预想点位')
      this.setData({
        busy: false,
        summary: r.summary || '',
        overall: score.overall != null ? String(score.overall) : '—',
        verdict: String(score.verdict || ''),
        dimensions: dims,
        checklist: r.checklist || [],
        recommendations: recs,
        nearbyCompetitors,
        heat,
        heatNote: heat && heat.insight ? '' : String((r.footTrafficHeat && (r.footTrafficHeat.summary || r.footTrafficHeat.level)) || ''),
        mapSourceLabel: intelMap.mapSourceLabel(r) || (mapView.showMap ? '选址地图' : ''),
        ...mapView,
      })
    })()
  },
})
