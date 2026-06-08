const applicationsStore = require('../../utils/applicationsStore.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const api = require('../../utils/api.js')
const appDisplay = require('../../utils/applicationDisplay.js')
const appFilters = require('../../utils/applicationFilters.js')
const videoUpload = require('../../utils/recruitmentVideoUpload.js')
const hallFilters = require('../../utils/recruitmentHallFilters.js')

Page({
  data: {
    rows: [],
    filteredRows: [],
    loading: true,
    timeFilter: 'all',
    timeFilterLabel: '时间',
    category: '全部',
    categoryLabel: '类目',
    province: '全部',
    city: '全部',
    regionLabel: '城市',
    timeOptions: appFilters.APPLICATION_TIME_FILTERS,
    categoryOptions: appFilters.CATEGORY_FILTERS,
    cityOptions: ['全部'],
    uploadingKey: '',
  },
  onShow() {
    this.load()
  },
  applyFilters(rows) {
    return appFilters.filterApplicationRows(rows, {
      timeFilter: this.data.timeFilter,
      category: this.data.category,
      province: this.data.province,
      city: this.data.city,
    })
  },
  async load() {
    const local = applicationsStore.readApplications()
    if (!api.hasApi()) {
      const rows = local.map((a) => ({
        ...a,
        title: a.title || a.mpOrderId,
        statusLabel: '—',
        platformIcon: '/images/platforms/douyin.png',
        category: '其他',
        canUploadVideo: true,
        uploadBtnLabel: '上传视频',
      }))
      const cityOptions = hallFilters.buildCityFilterOptions(rows)
      this.setData({
        rows,
        filteredRows: this.applyFilters(rows),
        cityOptions,
        loading: false,
      })
      return
    }
    this.setData({ loading: true })
    try {
      const reg = await ops.fetchRegistry()
      const mpList = reg.mpRecruitmentOrders || []
      const enriched = local.map((a) => {
        const mp = mpList.find((o) => o && o.id === a.mpOrderId)
        return appDisplay.enrichTalentApplicationRow(a, mp, reg)
      })
      const cityOptions = hallFilters.buildCityFilterOptions(enriched)
      this.setData({
        rows: enriched,
        filteredRows: this.applyFilters(enriched),
        cityOptions,
        loading: false,
      })
    } catch {
      const rows = local.map((a) => ({
        ...a,
        title: a.title || a.mpOrderId,
        statusLabel: '—',
        platformIcon: '/images/platforms/douyin.png',
        category: '其他',
        canUploadVideo: true,
        uploadBtnLabel: '上传视频',
      }))
      this.setData({
        rows,
        filteredRows: this.applyFilters(rows),
        loading: false,
      })
    }
  },
  onTimeFilterChange(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.timeOptions[idx] || this.data.timeOptions[0]
    this.setData({
      timeFilter: opt.id,
      timeFilterLabel: opt.id === 'all' ? '时间' : opt.label,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onCategoryChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.categoryOptions[idx] || '全部'
    this.setData({
      category: val,
      categoryLabel: val === '全部' ? '类目' : val,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onCityChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.cityOptions[idx] || '全部'
    this.setData({
      city: val,
      province: '全部',
      regionLabel: val === '全部' ? '城市' : val,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
  onUploadVideo(e) {
    const { id, applicant } = e.currentTarget.dataset
    if (!id || !applicant) {
      wx.showToast({ title: '缺少报名信息', icon: 'none' })
      return
    }
    const key = `${id}-${applicant}`
    if (this.data.uploadingKey) return
    this.setData({ uploadingKey: key })
    videoUpload
      .chooseAndUploadVideo(id, applicant)
      .then(() => this.load())
      .catch(() => {})
      .finally(() => this.setData({ uploadingKey: '' }))
  },
})
