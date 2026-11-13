const { prepareMineSubPage } = require('../../utils/pageIdentityChrome.js')
const xingxuan = require('../../utils/xingxuanEnhanceApi.js')

Page({
  data: {
    enabled: false,
    platformsText: '',
    citiesText: '',
    categoriesText: '',
    urgentOnly: false,
    matched: [],
    saving: false,
  },
  async onShow() {
    const ready = await prepareMineSubPage(this)
    if (!ready) return
    await this.load()
  },
  async load() {
    try {
      const res = await xingxuan.getSubscriptions()
      const sub = res.subscription || {}
      this.setData({
        enabled: !!sub.enabled,
        platformsText: (sub.platforms || []).join(','),
        citiesText: (sub.cities || []).join(','),
        categoriesText: (sub.categories || []).join(','),
        urgentOnly: !!sub.urgentOnly,
      })
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
  onToggle(e) {
    this.setData({ enabled: !!e.detail.value })
  },
  onPlatforms(e) {
    this.setData({ platformsText: e.detail.value })
  },
  onCities(e) {
    this.setData({ citiesText: e.detail.value })
  },
  onCategories(e) {
    this.setData({ categoriesText: e.detail.value })
  },
  toggleUrgent() {
    this.setData({ urgentOnly: !this.data.urgentOnly })
  },
  async save() {
    this.setData({ saving: true })
    try {
      const subscription = {
        enabled: this.data.enabled,
        platforms: this.data.platformsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        cities: this.data.citiesText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        categories: this.data.categoriesText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        urgentOnly: this.data.urgentOnly,
      }
      await xingxuan.saveSubscriptions(subscription, this.data.enabled)
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
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
})
