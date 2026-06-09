const applicationsStore = require('../../utils/applicationsStore.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const api = require('../../utils/api.js')
const listFilters = require('../../utils/recruitmentListFilters.js')
const shareCopy = require('../../utils/recruitmentShareCopy.js')
const userProfile = require('../../utils/userProfile.js')
const mpShare = require('../../utils/mpShare.js')
const recruitCoverLib = require('../../utils/recruitCoverLibrary.js')
const mpOrderRegistryOps = require('../../utils/mpOrderRegistryOps.js')
const { exportApplicantsExcel, formatExportError } = require('../../utils/mpApplicantsExport.js')
const hallFilters = require('../../utils/recruitmentHallFilters.js')
const prOrderFilters = require('../../utils/prOrderListFilters.js')
const prPublishedOrders = require('../../utils/prPublishedOrders.js')

function hallLabel(item, mp) {
  if (mp?.hall === 'urgent' || mp?.urgent) return '急单大厅'
  if (mp?.hall === 'ice' || mp?.orderKind === 'ice') return '云剪任务'
  if (item.hall === 'urgent') return '急单大厅'
  if (item.hall === 'ice') return '云剪任务'
  return '招募大厅'
}

function orderForShare(mp, row) {
  if (mp && mp.id) return mp
  const id = row && row.mpOrderId
  if (!id) return null
  return {
    id,
    title: row.title || id,
    region: '全国',
    recruitmentInfo: '',
    taskDetail: '',
    merchantRequirements: '',
  }
}

function mapRow(item, mp) {
  if (mp) {
    applicationsStore.touchPublishedOrderSnapshot(item.mpOrderId, {
      title: String(mp.title || mp.customerName || item.title || item.mpOrderId),
      lastStatus: String(mp.status || 'open'),
      hall: mp.hall === 'urgent' || mp.urgent ? 'urgent' : mp.hall === 'ice' || mp.orderKind === 'ice' ? 'ice' : 'normal',
    })
  }
  const enriched = listFilters.enrichMpOrderListItem(mp, item)
  const pendingVideoCount = prOrderFilters.countPendingVideos(mp)
  const videoCount = prOrderFilters.countVideos(mp)
  return {
    ...enriched,
    mp: mp || null,
    hallLabel: enriched.hallLabel || hallLabel(item, mp),
    platform: String((mp && mp.platform) || (mp && mp.recruitmentPlatform) || '抖音'),
    region: String((mp && mp.region) || (mp && mp.storeName) || ''),
    category: String((mp && mp.category) || '本地生活'),
    recruitTarget: (mp && mp.recruitTarget) || 'talent',
    pendingVideoCount,
    videoCount,
    videoReviewLabel:
      pendingVideoCount > 0 ? `视频审核(${pendingVideoCount})` : '视频审核',
  }
}

function rowById(rows, id) {
  const mpOrderId = String(id || '').trim()
  if (!mpOrderId) return null
  return (rows || []).find((r) => r && r.mpOrderId === mpOrderId) || null
}

function buildOrderSharePayload(order) {
  if (!order || !order.id) return null
  const share = {
    title: shareCopy.buildShareTitle(order) || order.title || '灵祺星选招募',
    path: `/pages/detail/detail?id=${encodeURIComponent(order.id)}`,
  }
  const coverUrl = recruitCoverLib.resolveOrderCoverUrl(order)
  const imageUrl = recruitCoverLib.resolveShareImageUrl(coverUrl)
  if (imageUrl) share.imageUrl = imageUrl
  return share
}

Page({
  data: {
    rows: [],
    filteredRows: [],
    keyword: '',
    loading: true,
    err: '',
    deletingId: '',
    togglingId: '',
    exportingId: '',
    filterTarget: 'all',
    filterTargetLabel: '身份',
    targetOptions: prOrderFilters.TARGET_FILTERS,
    filterPlatform: '全部',
    platformLabel: '平台',
    platformOptions: hallFilters.PLATFORM_FILTERS,
    filterCategory: '全部',
    categoryLabel: '类目',
    categoryOptions: prOrderFilters.CATEGORY_FILTERS,
    filterHall: '全部',
    hallLabel: '大厅',
    hallOptions: prOrderFilters.HALL_TYPE_FILTERS,
    filterCity: '全部',
    cityLabel: '城市',
    cityOptions: ['全部'],
    filterCountText: '',
    showShareSheet: false,
    shareOrder: null,
    shareTitle: '',
  },
  onShow() {
    mpShare.enableShareMenu()
    this.load()
  },
  filterOpts() {
    return {
      filterTarget: this.data.filterTarget,
      filterPlatform: this.data.filterPlatform,
      filterCategory: this.data.filterCategory,
      filterHall: this.data.filterHall,
      filterCity: this.data.filterCity,
      keyword: this.data.keyword,
    }
  },
  applyFilters(rows) {
    const filtered = prOrderFilters.filterPrOrderRows(rows, this.filterOpts())
    const total = (rows || []).length
    const filterCountText =
      filtered.length !== total ? `显示 ${filtered.length} / ${total} 条` : ''
    return { filtered, filterCountText }
  },
  refreshFiltered(rows) {
    const { filtered, filterCountText } = this.applyFilters(rows || this.data.rows)
    this.setData({ filteredRows: filtered, filterCountText })
  },
  onKeywordInput(e) {
    const keyword = String((e.detail && e.detail.value) || '')
    this.setData({ keyword })
    this.refreshFiltered(this.data.rows)
  },
  onTargetChipTap(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || 'all')
    const opt = (this.data.targetOptions || []).find((t) => t.id === id) || { id: 'all', label: '全部' }
    this.setData({
      filterTarget: opt.id,
      filterTargetLabel: opt.id === 'all' ? '身份' : opt.label,
    })
    this.refreshFiltered(this.data.rows)
  },
  onPlatformChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.platformOptions[idx] || '全部'
    this.setData({
      filterPlatform: val,
      platformLabel: val === '全部' ? '平台' : val,
    })
    this.refreshFiltered(this.data.rows)
  },
  onCategoryChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.categoryOptions[idx] || '全部'
    this.setData({
      filterCategory: val,
      categoryLabel: val === '全部' ? '类目' : val,
    })
    this.refreshFiltered(this.data.rows)
  },
  onHallChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.hallOptions[idx] || '全部'
    this.setData({
      filterHall: val,
      hallLabel: val === '全部' ? '大厅' : val,
    })
    this.refreshFiltered(this.data.rows)
  },
  onCityChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.cityOptions[idx] || '全部'
    this.setData({
      filterCity: val,
      cityLabel: val === '全部' ? '城市' : val,
    })
    this.refreshFiltered(this.data.rows)
  },
  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },
  async load() {
    if (!api.hasApi()) {
      const local = applicationsStore.readPublishedOrders()
      if (!local.length) {
        this.setData({
          rows: [],
          filteredRows: [],
          loading: false,
          err: '',
          filterCountText: '',
          cityOptions: ['全部'],
        })
        return
      }
      const rows = local.map((item) => mapRow(item, null))
      const cityOptions = hallFilters.buildCityFilterOptions(rows)
      const { filtered, filterCountText } = this.applyFilters(rows)
      this.setData({
        rows,
        filteredRows: filtered,
        cityOptions,
        filterCountText,
        loading: false,
        err: '未配置后台，无法同步报名人数',
      })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry()
      const mpList = reg.mpRecruitmentOrders || []
      prPublishedOrders.pruneOrphanPublishedOrders(mpList)
      const local = prPublishedOrders.listPublishedOrdersForCurrentPr(mpList)
      if (!local.length) {
        this.setData({
          rows: [],
          filteredRows: [],
          loading: false,
          err: '',
          filterCountText: '',
          cityOptions: ['全部'],
        })
        return
      }
      const rows = local.map((item) => {
        const mp = mpList.find((o) => o && o.id === item.mpOrderId)
        return mapRow(item, mp)
      })
      const cityOptions = hallFilters.buildCityFilterOptions(rows)
      const { filtered, filterCountText } = this.applyFilters(rows)
      this.setData({
        rows,
        filteredRows: filtered,
        cityOptions,
        filterCountText,
        loading: false,
        err: '',
      })
    } catch (e) {
      const fallbackLocal = applicationsStore.readPublishedOrders()
      const rows = fallbackLocal.map((item) => mapRow(item, null))
      const cityOptions = hallFilters.buildCityFilterOptions(rows)
      const { filtered, filterCountText } = this.applyFilters(rows)
      this.setData({
        rows,
        filteredRows: filtered,
        cityOptions,
        filterCountText,
        loading: false,
        err: String(e && e.message ? e.message : e).slice(0, 60),
      })
    }
  },
  goApplicants(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: `/pages/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(id)}`,
    })
  },
  goVideoReview(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: `/pages/mine-pr-order-video-review/mine-pr-order-video-review?id=${encodeURIComponent(id)}`,
    })
  },
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    try {
      wx.setStorageSync('meoo_publish_edit_mp_id', id)
    } catch (_) {}
    wx.switchTab({ url: '/pages/publish/publish' })
  },
  onShare(e) {
    const id = e.currentTarget.dataset.id
    const row = rowById(this.data.filteredRows, id) || rowById(this.data.rows, id)
    if (!row) return
    const order = orderForShare(row.mp, row)
    if (!order) {
      wx.showToast({ title: '订单数据缺失', icon: 'none' })
      return
    }
    this.setData({
      shareOrder: order,
      shareTitle: shareCopy.buildShareTitle(order),
      showShareSheet: true,
    })
  },
  noopShareSheetTap() {},
  onCloseShareSheet() {
    this.setData({ showShareSheet: false })
  },
  onShareCopyText() {
    const order = this.data.shareOrder
    if (!order) return
    wx.showLoading({ title: '生成报名链接', mask: true })
    shareCopy
      .buildGroupCopyTextAsync(order, userProfile.readPrProfile())
      .then((text) => {
        wx.hideLoading()
        this.setData({ showShareSheet: false })
        wx.setClipboardData({
          data: text,
          success: () => {
            wx.showModal({
              title: '已复制招募信息',
              content: '请打开微信群，粘贴发送给达人即可。',
              showCancel: false,
            })
          },
        })
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '生成链接失败', icon: 'none' })
      })
  },
  onShareTimelineTap() {
    const order = this.data.shareOrder
    if (!order) return
    wx.showLoading({ title: '生成招募文案', mask: true })
    shareCopy
      .buildGroupCopyTextAsync(order, userProfile.readPrProfile())
      .then((text) => {
        wx.hideLoading()
        this.setData({ showShareSheet: false })
        wx.setClipboardData({
          data: text,
          success: () => {
            wx.showModal({
              title: '已复制招募文案',
              content:
                '请点击右上角 ···，选择「分享到朋友圈」。小程序卡片会带上本招募单，文案可粘贴到朋友圈正文。',
              showCancel: false,
            })
          },
        })
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '生成文案失败', icon: 'none' })
      })
  },
  onShareAppMessage() {
    const payload = buildOrderSharePayload(this.data.shareOrder)
    if (!payload) return mpShare.defaultShare('/pages/index/index')
    return payload
  },
  onShareTimeline() {
    const order = this.data.shareOrder
    if (!order || !order.id) {
      return { title: mpShare.DEFAULT_TITLE, query: '' }
    }
    const payload = buildOrderSharePayload(order)
    const out = {
      title: payload.title,
      query: `id=${encodeURIComponent(order.id)}`,
    }
    if (payload.imageUrl) out.imageUrl = payload.imageUrl
    return out
  },
  onToggleStatus(e) {
    const id = e.currentTarget.dataset.id
    const row = rowById(this.data.filteredRows, id) || rowById(this.data.rows, id)
    if (!id || !row || this.data.togglingId) return
    if (!row.canToggleRecruit) {
      wx.showToast({ title: '当前状态不可切换', icon: 'none' })
      return
    }
    if (!api.hasApi()) {
      wx.showToast({ title: '未配置后台地址', icon: 'none' })
      return
    }
    const next = row.toggleNextStatus
    const action = row.toggleActionLabel
    wx.showModal({
      title: `${action}招募`,
      content:
        next === 'closed'
          ? '停止后达人将无法在招募大厅继续报名，已报名数据保留。'
          : '开始后将在招募大厅重新展示并开放报名。',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ togglingId: id })
        wx.showLoading({ title: `${action}中…`, mask: true })
        try {
          await mpOrderRegistryOps.patchMpRecruitmentOrderStatus(id, next)
          wx.showToast({ title: `已${action}`, icon: 'success' })
          const localItem =
            applicationsStore.readPublishedOrders().find((x) => x.mpOrderId === id) || {
              mpOrderId: id,
              title: row.title,
            }
          const optimisticMp = row.mp ? { ...row.mp, status: next } : { id, status: next }
          const patchRow = (rows) =>
            (rows || []).map((r) => {
              if (!r || r.mpOrderId !== id) return r
              return mapRow(localItem, optimisticMp)
            })
          const nextRows = patchRow(this.data.rows)
          const { filtered, filterCountText } = this.applyFilters(nextRows)
          this.setData({ rows: nextRows, filteredRows: filtered, filterCountText })
          await this.load()
        } catch (err) {
          wx.showToast({
            title: String(err && err.message ? err.message : err).slice(0, 28),
            icon: 'none',
          })
        } finally {
          wx.hideLoading()
          this.setData({ togglingId: '' })
        }
      },
    })
  },
  async onDownload(e) {
    const id = e.currentTarget.dataset.id
    const row = rowById(this.data.filteredRows, id) || rowById(this.data.rows, id)
    if (!row || this.data.exportingId) return
    const applicants = row.mp && Array.isArray(row.mp.applicants) ? row.mp.applicants : []
    if (!applicants.length) {
      wx.showToast({ title: '暂无报名可下载', icon: 'none' })
      return
    }
    this.setData({ exportingId: row.mpOrderId })
    wx.showLoading({ title: '生成 Excel…', mask: true })
    try {
      const res = await exportApplicantsExcel(applicants, row.mpOrderId)
      if (res.mode === 'clipboard') {
        wx.showToast({ title: '已复制，可粘贴到 Excel', icon: 'none', duration: 2500 })
      } else if (res.mode === 'saved') {
        wx.showModal({
          title: '表格已生成',
          content: 'CSV 已保存到本机。若无法自动打开，可将表格内容粘贴到 Excel / WPS。',
          showCancel: false,
          confirmText: '知道了',
        })
      }
    } catch (err) {
      wx.showToast({
        title: formatExportError(err).slice(0, 36),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ exportingId: '' })
    }
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.deletingId) return
    wx.showModal({
      title: '删除发单',
      content: '删除后达人将无法在招募大厅看到该单，已报名信息将一并移除。确定删除？',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        if (!api.hasApi()) {
          applicationsStore.removePublishedOrder(id)
          wx.showToast({ title: '已从本地移除', icon: 'none' })
          this.load()
          return
        }
        this.setData({ deletingId: id })
        wx.showLoading({ title: '删除中…', mask: true })
        try {
          await mpOrderRegistryOps.deleteMpRecruitmentOrder(id)
          applicationsStore.markPublishedOrderDeleted(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          await this.load()
        } catch (err) {
          wx.showToast({
            title: String(err && err.message ? err.message : err).slice(0, 28),
            icon: 'none',
          })
        } finally {
          wx.hideLoading()
          this.setData({ deletingId: '' })
        }
      },
    })
  },
})
