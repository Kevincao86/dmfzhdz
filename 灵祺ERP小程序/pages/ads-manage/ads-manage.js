const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')
const sessionSync = require('../../utils/merchantSessionSyncMp.js')
const {
  emptyTodayStats,
  statsFromAds,
  enrichAdRow,
  previewAds,
  tabCounts,
  filterByTab,
  shouldUsePreview,
} = require('../../utils/adsManageUiMp.js')

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
    todayStats: emptyTodayStats(),
    statusTabs: [],
    activeTab: 'all',
    showFilter: false,
    hasUnread: false,
    channel: 'local_promotion',
    channels: CHANNELS,
    expandedId: '',
    bindHint: '',
    createOpen: false,
    createName: '',
    createBudget: '300',
    createGoal: 'video',
    createGoals: [
      { id: 'video', label: '短视频' },
      { id: 'live', label: '直播' },
      { id: 'clue', label: '线索' },
    ],
    createBusy: false,
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
    this.setData({ channel: id, activeTab: 'all', expandedId: '' })
    void this.load()
  },

  async load() {
    if (shouldUsePreview()) {
      const items = previewAds()
      this.applyTab(items)
      this.setData({ loading: false, err: '', hasUnread: false, todayStats: statsFromAds(items), bindHint: '' })
      return
    }
    this.setData({ loading: true, err: '' })
    const [listR, reportR] = await Promise.all([
      feature.fetchAdsPromotions(this.data.channel),
      feature.fetchAdsReport(this.data.channel),
    ])
    if (!listR.ok) {
      this.setData({
        loading: false,
        err: listR.message,
        items: [],
        displayItems: [],
        statusTabs: tabCounts([]),
        todayStats: emptyTodayStats(),
        bindHint: listR.message,
      })
      return
    }
    const tag = this.data.channel === 'qianchuan' ? '千川' : '本地推'
    const items = (listR.items || []).map((x) =>
      enrichAdRow({
        ...x,
        tags: x.tags || [tag],
        dailyBudget: x.budget,
        spend: x.spend,
        exposure: x.exposure,
        click: x.click,
      }),
    )
    this.applyTab(items)
    let todayStats = statsFromAds(items)
    const sum = reportR.ok && reportR.summary ? reportR.summary : null
    if (sum) {
      todayStats = [
        { key: 'spend', label: '消耗(元)', value: sum.statCost != null ? String(sum.statCost) : todayStats[0].value, trend: '' },
        { key: 'expose', label: '曝光', value: sum.showCnt != null ? String(sum.showCnt) : todayStats[1].value, trend: '' },
        { key: 'click', label: '点击', value: sum.clickCnt != null ? String(sum.clickCnt) : todayStats[2].value, trend: '' },
        { key: 'deal', label: '转化', value: sum.convertCnt != null ? String(sum.convertCnt) : todayStats[3].value, trend: '' },
      ]
    }
    this.setData({
      loading: false,
      err: '',
      bindHint: listR.apiError || '',
      todayStats,
    })
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
    this.setData({
      createOpen: true,
      createName: '',
      createBudget: '300',
      createGoal: 'video',
    })
  },

  onCreateClose() {
    this.setData({ createOpen: false })
  },
  onCreateName(e) {
    this.setData({ createName: e.detail.value })
  },
  onCreateBudget(e) {
    this.setData({ createBudget: e.detail.value })
  },
  onCreateGoal(e) {
    const id = e.currentTarget.dataset.id
    if (id) this.setData({ createGoal: id })
  },
  async onCreateSubmit() {
    if (this.data.createBusy) return
    this.setData({ createBusy: true })
    wx.showLoading({ title: '创建中…', mask: true })
    const r = await feature.createAdsPromotion(this.data.channel, {
      name: this.data.createName,
      budgetYuan: Number(this.data.createBudget),
      goal: this.data.createGoal,
    })
    wx.hideLoading()
    this.setData({ createBusy: false })
    if (!r.ok) {
      wx.showModal({ title: '创建失败', content: r.message || '巨量/聚光拒绝了该请求', showCancel: false })
      return
    }
    this.setData({ createOpen: false })
    wx.showModal({
      title: '已提交新建',
      content: r.message || '计划已创建。创意素材可随后在广告平台补齐。',
      showCancel: false,
    })
    await this.load()
  },

  onViewAllData() {
    const s = this.data.todayStats || []
    const lines = s.map((x) => `${x.label}：${x.value}`).join('\n')
    wx.showModal({
      title:
        this.data.channel === 'qianchuan'
          ? '千川今日数据'
          : this.data.channel === 'xhs_juguang'
            ? '聚光今日数据'
            : '本地推今日数据',
      content: lines || '暂无报表',
      showCancel: false,
    })
  },

  async onManage(e) {
    const id = e.currentTarget.dataset.id
    const row = (this.data.items || []).find((x) => x.id === id)
    if (!row) return
    const paused = row.statusKey === 'paused'
    const opt = paused ? 'ENABLE' : 'DISABLE'
    wx.showLoading({ title: paused ? '开启中' : '暂停中', mask: true })
    const r = await feature.updateAdsStatus(this.data.channel, [id], opt)
    wx.hideLoading()
    if (!r.ok) {
      wx.showToast({ title: r.message || '操作失败', icon: 'none' })
      return
    }
    wx.showToast({ title: paused ? '已继续投放' : '已暂停', icon: 'none' })
    await this.load()
  },

  onViewData(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expandedId: this.data.expandedId === id ? '' : id })
  },

  noop() {},
})
