const { prepareXingxuanSubPage } = require('../../../utils/pageIdentityChrome.js')
const xingxuan = require('../../../utils/xingxuanEnhanceApi.js')
const pickers = require('../../../utils/subscriptionPickerHelpers.js')
const mpSubscribe = require('../../../utils/mpSubscribeMessages.js')

Page({
  data: {
    enabled: false,
    selectedPlatforms: [],
    platformGrid: pickers.buildPlatformGrid([]),
    cityNational: false,
    selectedCities: [],
    selectedCategories: [],
    cityKeyword: '',
    cityActiveProvince: '',
    cityProvinceRows: [],
    cityCheckGrid: [],
    citySelectedChips: [],
    cityDisplayText: '请选择关注城市',
    cityPlaceholder: true,
    tagGrid: pickers.buildTagGrid([]),
    categoriesDisplayText: '请选择关注品类',
    categoriesPlaceholder: true,
    pickerView: '',
    urgentOnly: false,
    matched: [],
    saving: false,
  },

  async onShow() {
    const ready = await prepareXingxuanSubPage(this)
    if (!ready) return
    await this.load()
  },

  async load() {
    try {
      const res = await xingxuan.getSubscriptions()
      const sub = res.subscription || {}
      const cityState = pickers.citiesFromSubscription(sub.cities || [])
      const platforms = sub.platforms || []
      const categories = sub.categories || []
      this.setData({
        enabled: !!sub.enabled,
        selectedPlatforms: platforms,
        platformGrid: pickers.buildPlatformGrid(platforms),
        cityNational: cityState.cityNational,
        selectedCities: cityState.selectedCities,
        selectedCategories: categories,
        urgentOnly: !!sub.urgentOnly,
      })
      this.syncDisplayFields()
      if (sub.enabled) await this.refreshMatched()
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async refreshMatched() {
    try {
      const res = await xingxuan.matchSubscriptionOrders()
      this.setData({ matched: res.matched || [] })
    } catch {
      this.setData({ matched: [] })
    }
  },

  syncDisplayFields() {
    const cities = this.data.selectedCities || []
    this.setData({
      cityDisplayText: pickers.formatCitiesDisplay(this.data.cityNational, cities),
      cityPlaceholder: !this.data.cityNational && !cities.length,
      citySelectedChips: cities.map((name) => ({ name })),
      categoriesDisplayText: pickers.formatTagsDisplay(this.data.selectedCategories),
      categoriesPlaceholder: !(this.data.selectedCategories || []).length,
    })
  },

  onToggle(e) {
    this.setData({ enabled: !!e.detail.value })
  },

  onPlatformTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    let selected = [...(this.data.selectedPlatforms || [])]
    const idx = selected.indexOf(name)
    if (idx >= 0) selected.splice(idx, 1)
    else selected.push(name)
    this.setData({
      selectedPlatforms: selected,
      platformGrid: pickers.buildPlatformGrid(selected),
    })
  },

  openPicker(e) {
    const view = e.currentTarget.dataset.view
    if (!view) return
    const patch = { pickerView: view }
    if (view === 'tag') patch.tagGrid = pickers.buildTagGrid(this.data.selectedCategories)
    if (view === 'city') patch.cityKeyword = ''
    this.setData(patch, () => {
      if (view === 'city') this.refreshCityModalUi('')
    })
  },

  closePicker() {
    this.setData({ pickerView: '' })
  },

  refreshCityModalUi(activeProvinceHint) {
    const kw = this.data.cityKeyword
    const hint = activeProvinceHint != null ? activeProvinceHint : this.data.cityActiveProvince
    const st = pickers.cityPicker.initModalState(kw, hint, this.data.selectedCities || [])
    this.setData({
      cityActiveProvince: st.activeProvince,
      cityProvinceRows: st.provinceRows,
      cityCheckGrid: st.cityCheckGrid,
    })
  },

  onCityNational() {
    this.setData({ cityNational: true, selectedCities: [] })
    this.syncDisplayFields()
    this.closePicker()
  },

  onCityKeyword(e) {
    this.setData({ cityKeyword: e.detail.value }, () => this.refreshCityModalUi())
  },

  onCityProvinceTap(e) {
    const province = e.currentTarget.dataset.name
    if (!province || province === this.data.cityActiveProvince) return
    this.refreshCityModalUi(province)
  },

  onCityCheckTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    let cities = [...(this.data.selectedCities || [])]
    const idx = cities.indexOf(name)
    if (idx >= 0) cities.splice(idx, 1)
    else cities.push(name)
    this.setData({ selectedCities: cities, cityNational: false }, () => {
      this.refreshCityModalUi()
      this.syncDisplayFields()
    })
  },

  onRemoveCityChip(e) {
    const name = e.currentTarget.dataset.name
    const cities = (this.data.selectedCities || []).filter((c) => c !== name)
    this.setData({ selectedCities: cities })
    this.syncDisplayFields()
  },

  confirmCityPicker() {
    if (!this.data.cityNational && !(this.data.selectedCities || []).length) {
      wx.showToast({ title: '请选择全国或添加城市', icon: 'none' })
      return
    }
    this.syncDisplayFields()
    this.closePicker()
  },

  onTagTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const grid = this.data.tagGrid.map((t) => ({ ...t }))
    const item = grid.find((t) => t.name === name)
    if (!item || item.disabled) return
    item.on = !item.on
    this.setData({ tagGrid: grid })
  },

  confirmTagPicker() {
    const selectedCategories = this.data.tagGrid.filter((t) => t.on).map((t) => t.name)
    if (!selectedCategories.length) {
      wx.showToast({ title: '请至少选择1个品类', icon: 'none' })
      return
    }
    this.setData({ selectedCategories })
    this.syncDisplayFields()
    this.closePicker()
  },

  toggleUrgent() {
    this.setData({ urgentOnly: !this.data.urgentOnly })
  },

  async save() {
    this.setData({ saving: true })
    try {
      const subscription = {
        enabled: this.data.enabled,
        platforms: [...(this.data.selectedPlatforms || [])],
        cities: pickers.citiesToSubscription(this.data.cityNational, this.data.selectedCities),
        categories: [...(this.data.selectedCategories || [])],
        urgentOnly: this.data.urgentOnly,
      }
      await xingxuan.saveSubscriptions(subscription, this.data.enabled)
      if (this.data.enabled) {
        await mpSubscribe.requestForOrderSubscription()
      }
      wx.showToast({ title: '已保存' })
      if (this.data.enabled) await this.refreshMatched()
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(id)}` })
  },
})
