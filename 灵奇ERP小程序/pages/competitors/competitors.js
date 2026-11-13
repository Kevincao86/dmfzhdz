const feat = require('../../utils/merchantFeatureApisMp.js')
const feature = require('../../utils/merchantFeatureMp.js')
const intelMap = require('../../utils/storeIntelMapMp.js')

async function loadDouyinStores() {
  const all = []
  const seen = {}
  for (let page = 1; page <= 8; page += 1) {
    const r = await feature.fetchStoresForPlatform('douyin', '', { page, pageSize: 50 })
    if (!r.ok) return page === 1 ? r : { ok: true, items: all }
    const batch = r.items || []
    for (let i = 0; i < batch.length; i += 1) {
      const s = batch[i]
      const id = s && s.id ? String(s.id) : ''
      if (!id || seen[id]) continue
      seen[id] = true
      all.push(s)
    }
    if (batch.length < 50) break
    if (typeof r.total === 'number' && all.length >= r.total) break
  }
  return { ok: true, items: all }
}

Page({
  data: {
    storeOptions: [],
    storeLabels: [],
    storeIndex: 0,
    storePicked: false,
    storeName: '',
    address: '',
    storeLoading: false,
    storeErr: '',
    busy: false,
    err: '',
    summary: '',
    competitors: [],
    suggestions: [],
    bundles: [],
    heat: null,
    mapSourceLabel: '',
    showMap: false,
    mapLat: 30,
    mapLng: 120,
    markers: [],
    includePoints: [],
  },

  onShow() {
    if (this.data.busy) return
    void this.loadStores()
  },

  async loadStores() {
    this.setData({ storeLoading: true, storeErr: '' })
    const r = await loadDouyinStores()
    if (!r.ok) {
      this.setData({
        storeLoading: false,
        storeOptions: [],
        storeLabels: [],
        storePicked: false,
        storeName: '',
        address: '',
        storeErr: r.message || '门店加载失败',
      })
      return
    }
    const storeOptions = (r.items || [])
      .filter((s) => String((s && s.address) || '').trim())
      .map((s) => ({
        id: s.id,
        name: s.name,
        address: String(s.address).trim(),
        label: s.name,
      }))
    const keepId = this._pickedId
    let storeIndex = 0
    let storePicked = false
    let storeName = ''
    let address = ''
    if (keepId) {
      const idx = storeOptions.findIndex((s) => s.id === keepId)
      if (idx >= 0) {
        storeIndex = idx
        storePicked = true
        storeName = storeOptions[idx].name
        address = storeOptions[idx].address
      }
    }
    this.setData({
      storeLoading: false,
      storeOptions,
      storeLabels: storeOptions.map((s) => s.label),
      storeIndex,
      storePicked,
      storeName,
      address,
      storeErr: storeOptions.length ? '' : '没有带地址的已认领门店。请先在抖音来客认领门店。',
    })
  },

  onPickStore(e) {
    const idx = Number(e.detail.value)
    const row = this.data.storeOptions[idx]
    if (!row) return
    this._pickedId = row.id
    this.setData({
      storeIndex: idx,
      storePicked: true,
      storeName: row.name,
      address: row.address,
      err: '',
    })
  },

  onAnalyze() {
    const storeName = String(this.data.storeName || '').trim()
    const address = String(this.data.address || '').trim()
    if (!this.data.storePicked || !storeName || !address) {
      wx.showToast({ title: '请先选择门店', icon: 'none' })
      return
    }
    this.setData({
      busy: true,
      err: '',
      summary: '',
      competitors: [],
      suggestions: [],
      bundles: [],
      heat: null,
      mapSourceLabel: '',
      showMap: false,
      markers: [],
      includePoints: [],
    })
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
      const mapView = intelMap.buildMapView(r, storeName)
      this.setData({
        busy: false,
        summary: r.summary,
        competitors: (r.competitors || []).map((c, i) => ({
          id: `c-${i}`,
          name: String(c.name || c.storeName || '竞品').trim(),
          distance: c.distanceHint || c.distance || c.distanceText || '',
          priceBand: c.priceRange || c.priceBand || '',
          note: c.highlights || c.note || c.highlight || c.summary || '',
          hots: intelMap.mapHotProducts(c.hotProducts),
        })),
        suggestions: r.suggestions || [],
        bundles: intelMap.mapBundles(r.bundleSuggestions),
        heat: intelMap.mapHeat(r.footTrafficHeat),
        mapSourceLabel: intelMap.mapSourceLabel(r),
        ...mapView,
      })
    })()
  },
})
