const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')
const sessionSync = require('../../utils/merchantSessionSyncMp.js')
const {
  LEAD_TABS,
  emptyStatCards,
  statsFromLeads,
  enrichLeadRow,
  previewLeads,
  filterLeads,
  shouldUsePreview,
} = require('../../utils/leadsCenterUiMp.js')

const CHANNELS = [
  { id: 'local_promotion', label: '本地推' },
  { id: 'qianchuan', label: '千川' },
  { id: 'xhs_juguang', label: '聚光' },
]

Page({
  data: {
    loading: false,
    err: '',
    items: [],
    displayItems: [],
    statCards: emptyStatCards(),
    leadTabs: LEAD_TABS,
    activeTab: 'all',
    searchKw: '',
    showFilter: false,
    channel: 'local_promotion',
    channels: CHANNELS,
  },

  onShow() {
    if (!api.canAccessPage()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.boot()
  },

  async onPullDownRefresh() {
    try {
      await sessionSync.syncFromCloud({ force: true })
      await this.load()
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  async boot() {
    try {
      await sessionSync.syncFromCloud({ force: false })
    } catch (_) {}
    await this.load()
  },

  onChannel(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.channel) return
    this.setData({ channel: id, activeTab: 'all' })
    void this.load()
  },

  async load() {
    if (shouldUsePreview()) {
      const items = previewLeads()
      this.applyFilter(items)
      this.setData({ loading: false, err: '', statCards: statsFromLeads(items) })
      return
    }
    this.setData({ loading: true, err: '' })
    const r = await feature.fetchAdsClues(this.data.channel, 1)
    if (!r.ok) {
      this.setData({
        loading: false,
        err: r.message,
        items: [],
        displayItems: [],
        statCards: emptyStatCards(),
      })
      return
    }
    const source = this.data.channel === 'qianchuan' ? '巨量千川' : '巨量本地推'
    const items = (r.items || []).map((x) => enrichLeadRow({ ...x, source: x.source || source }))
    this.applyFilter(items)
    this.setData({ loading: false, err: '', statCards: statsFromLeads(items) })
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

  findLead(id) {
    return (this.data.items || []).find((x) => x.id === id)
  },

  async onPrimary(e) {
    const id = e.currentTarget.dataset.id
    const row = this.findLead(id)
    if (!row) return
    if (row.phone) {
      wx.makePhoneCall({
        phoneNumber: String(row.phone).replace(/\D/g, ''),
        fail() {},
      })
    }
    if (row.stateKey === 'converted' || row.stateKey === 'invalid') return
    const r = await feature.postClueCallback(this.data.channel, id, 'CLUE_CONFIRM')
    if (!r.ok) {
      wx.showToast({ title: r.message || '回传失败', icon: 'none' })
      return
    }
    wx.showToast({ title: '已标记跟进', icon: 'none' })
    await this.load()
  },

  async onSecondary(e) {
    const id = e.currentTarget.dataset.id
    const row = this.findLead(id)
    if (!row) return
    if (row.stateKey === 'pending') {
      const r = await feature.postClueCallback(this.data.channel, id, 'INVALID_EVENT')
      if (!r.ok) {
        wx.showToast({ title: r.message || '回传失败', icon: 'none' })
        return
      }
      wx.showToast({ title: '已标无效', icon: 'none' })
      await this.load()
      return
    }
    if (row.phone) {
      wx.setClipboardData({
        data: String(row.phone),
        success: () => wx.showToast({ title: '已复制号码', icon: 'none' }),
      })
    }
  },
})
