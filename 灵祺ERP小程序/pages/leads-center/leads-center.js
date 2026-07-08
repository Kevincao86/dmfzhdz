const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')
const {
  LEAD_TABS,
  STAT_CARDS,
  enrichLeadRow,
  previewLeads,
  filterLeads,
  shouldUsePreview,
} = require('../../utils/leadsCenterUiMp.js')

Page({
  data: {
    loading: false,
    err: '',
    items: [],
    displayItems: [],
    statCards: STAT_CARDS,
    leadTabs: LEAD_TABS,
    activeTab: 'all',
    searchKw: '',
    showFilter: false,
  },

  onShow() {
    if (!api.canAccessPage()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.load()
  },

  async load() {
    if (shouldUsePreview()) {
      const items = previewLeads()
      this.applyFilter(items)
      this.setData({ loading: false, err: '' })
      return
    }
    this.setData({ loading: true, err: '' })
    const r = await feature.fetchLocalClues(1)
    if (!r.ok) {
      this.setData({ loading: false, err: r.message, items: [], displayItems: [] })
      return
    }
    const items = (r.items || []).map((x) =>
      enrichLeadRow({
        ...x,
        content: x.content || `${x.name} 提交了咨询`,
        source: '巨量本地推',
      }),
    )
    this.applyFilter(items)
    this.setData({ loading: false, err: '' })
  },

  applyFilter(items) {
    const displayItems = filterLeads(items, this.data.activeTab, this.data.searchKw)
    this.setData({ items, displayItems })
  },

  onTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activeTab) return
    this.setData({ activeTab: id })
    this.applyFilter(this.data.items)
  },

  onSearch(e) {
    this.setData({ searchKw: e.detail.value || '' })
    this.applyFilter(this.data.items)
  },

  toggleFilter() {
    this.setData({ showFilter: !this.data.showFilter })
  },

  onPrimary() {
    wx.showToast({ title: '请在电脑端处理线索', icon: 'none' })
  },

  onSecondary() {
    wx.showToast({ title: '已记录', icon: 'none' })
  },
})
