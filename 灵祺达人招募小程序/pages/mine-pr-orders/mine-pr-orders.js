const applicationsStore = require('../../utils/applicationsStore.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const merchant = require('../../utils/merchantApi.js')
const listFilters = require('../../utils/recruitmentListFilters.js')
const shareCopy = require('../../utils/recruitmentShareCopy.js')
const userProfile = require('../../utils/userProfile.js')
const mpOrderRegistryOps = require('../../utils/mpOrderRegistryOps.js')
const { exportApplicantsExcel } = require('../../utils/mpApplicantsExport.js')

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
  const enriched = listFilters.enrichMpOrderListItem(mp, item)
  return {
    ...enriched,
    mp: mp || null,
    hallLabel: hallLabel(item, mp),
  }
}

Page({
  data: {
    rows: [],
    loading: true,
    err: '',
    deletingId: '',
    togglingId: '',
    exportingId: '',
  },
  onShow() {
    this.load()
  },
  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },
  async load() {
    const local = applicationsStore.readPublishedOrders()
    if (!local.length) {
      this.setData({ rows: [], loading: false, err: '' })
      return
    }
    if (!merchant.hasMerchantApi()) {
      this.setData({
        rows: local.map((item) => mapRow(item, null)),
        loading: false,
        err: '未配置后台，无法同步报名人数',
      })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry()
      const mpList = reg.mpRecruitmentOrders || []
      const rows = local.map((item) => {
        const mp = mpList.find((o) => o && o.id === item.mpOrderId)
        return mapRow(item, mp)
      })
      this.setData({ rows, loading: false, err: '' })
    } catch (e) {
      this.setData({
        rows: local.map((item) => mapRow(item, null)),
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
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    try {
      wx.setStorageSync('meoo_publish_edit_mp_id', id)
    } catch (_) {}
    wx.switchTab({ url: '/pages/publish/publish' })
  },
  onShare(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const row = this.data.rows[idx]
    if (!row) return
    const order = orderForShare(row.mp, row)
    if (!order) {
      wx.showToast({ title: '订单数据缺失', icon: 'none' })
      return
    }
    const text = shareCopy.buildGroupCopyText(order, userProfile.readPrProfile())
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
  },
  onToggleStatus(e) {
    const id = e.currentTarget.dataset.id
    const idx = Number(e.currentTarget.dataset.index)
    const row = this.data.rows[idx]
    if (!id || !row || this.data.togglingId) return
    if (!row.canToggleRecruit) {
      wx.showToast({ title: '当前状态不可切换', icon: 'none' })
      return
    }
    if (!merchant.hasMerchantApi()) {
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
    const idx = Number(e.currentTarget.dataset.index)
    const row = this.data.rows[idx]
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
      }
    } catch (err) {
      wx.showToast({
        title: String(err && err.message ? err.message : err).slice(0, 36),
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
        if (!merchant.hasMerchantApi()) {
          applicationsStore.removePublishedOrder(id)
          wx.showToast({ title: '已从本地移除', icon: 'none' })
          this.load()
          return
        }
        this.setData({ deletingId: id })
        wx.showLoading({ title: '删除中…', mask: true })
        try {
          await mpOrderRegistryOps.deleteMpRecruitmentOrder(id)
          applicationsStore.removePublishedOrder(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          this.load()
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
