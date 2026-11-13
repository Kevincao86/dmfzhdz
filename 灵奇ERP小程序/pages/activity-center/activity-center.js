const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')
const { PLATFORM_TABS } = require('../../utils/platformTokensMp.js')

const STATUS_TABS = [
  { id: 'all', label: '全部' },
  { id: 'ongoing', label: '进行中' },
  { id: 'enrollable', label: '可报名' },
  { id: 'ended', label: '已结束' },
]

Page({
  data: {
    platform: 'douyin',
    tabs: PLATFORM_TABS.filter((p) => ['douyin', 'meituan', 'xiaohongshu'].includes(p.id)),
    statusTabs: STATUS_TABS,
    status: 'all',
    loading: false,
    err: '',
    items: [],
    expandedId: '',
  },
  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.load()
  },
  async onPullDownRefresh() {
    try {
      await this.load()
    } finally {
      wx.stopPullDownRefresh()
    }
  },
  onTab(e) {
    this.setData({ platform: e.currentTarget.dataset.id, expandedId: '' })
    void this.load()
  },
  onStatus(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.status) return
    this.setData({ status: id, expandedId: '' })
    void this.load()
  },
  async load() {
    this.setData({ loading: true, err: '' })
    const r = await feature.fetchMarketingActivities(this.data.platform, this.data.status)
    this.setData({
      loading: false,
      err: r.ok ? '' : r.message,
      items: r.ok ? r.items : [],
    })
  },
  onExpand(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expandedId: this.data.expandedId === id ? '' : id })
  },
  onCopy(e) {
    const title = e.currentTarget.dataset.title || ''
    if (!title) return
    wx.setClipboardData({ data: String(title) })
  },
})
