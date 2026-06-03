const applicationsStore = require('../../utils/applicationsStore.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const api = require('../../utils/api.js')
const appDisplay = require('../../utils/applicationDisplay.js')

Page({
  data: {
    rows: [],
    loading: true,
  },
  onShow() {
    this.load()
  },
  async load() {
    const local = applicationsStore.readApplications()
    if (!api.hasApi()) {
      this.setData({
        rows: local.map((a) => ({
          ...a,
          title: a.title || a.mpOrderId,
          statusLabel: '—',
          platformIcon: '/images/platforms/douyin.png',
        })),
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
      this.setData({ rows: enriched, loading: false })
    } catch {
      this.setData({
        rows: local.map((a) => ({
          ...a,
          title: a.title || a.mpOrderId,
          statusLabel: '—',
          platformIcon: '/images/platforms/douyin.png',
        })),
        loading: false,
      })
    }
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
})
