const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')
const {
  TODAY_STATS,
  enrichAdRow,
  previewAds,
  tabCounts,
  filterByTab,
  shouldUsePreview,
} = require('../../utils/adsManageUiMp.js')

Page({
  data: {
    loading: false,
    err: '',
    items: [],
    displayItems: [],
    todayStats: TODAY_STATS,
    statusTabs: [],
    activeTab: 'all',
    showFilter: false,
    hasUnread: true,
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
      const items = previewAds()
      this.applyTab(items)
      this.setData({ loading: false, err: '', hasUnread: true })
      return
    }
    this.setData({ loading: true, err: '' })
    const r = await feature.fetchLocalPromotions()
    if (!r.ok) {
      this.setData({ loading: false, err: r.message, items: [], displayItems: [], statusTabs: tabCounts([]) })
      return
    }
    const items = (r.items || []).map((x) =>
      enrichAdRow({
        ...x,
        dailyBudget: x.budget,
        spend: '—',
        exposure: '—',
        duration: '—',
      }),
    )
    this.applyTab(items)
    this.setData({ loading: false, err: '' })
  },

  applyTab(items) {
    const statusTabs = tabCounts(items)
    const displayItems = filterByTab(items, this.data.activeTab)
    this.setData({ items, statusTabs, displayItems })
  },

  onTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activeTab) return
    this.setData({
      activeTab: id,
      displayItems: filterByTab(this.data.items, id),
    })
  },

  toggleFilter() {
    this.setData({ showFilter: !this.data.showFilter })
  },

  onBell() {
    wx.navigateTo({ url: '/pages/notifications/notifications' })
  },

  onCreateAd() {
    wx.showToast({ title: '请在电脑端创建广告', icon: 'none' })
  },

  onViewAllData() {
    wx.showToast({ title: '完整数据请在电脑端查看', icon: 'none' })
  },

  onManage() {
    wx.showToast({ title: '请在电脑端管理投放', icon: 'none' })
  },

  onViewData() {
    wx.showToast({ title: '数据详情请在电脑端查看', icon: 'none' })
  },
})
