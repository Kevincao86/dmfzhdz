const applicationsStore = require('../../utils/applicationsStore.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const merchant = require('../../utils/merchantApi.js')

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
    if (!merchant.hasMerchantApi()) {
      this.setData({ rows: local, loading: false })
      return
    }
    this.setData({ loading: true })
    try {
      const reg = await ops.fetchRegistry()
      const mpList = reg.mpRecruitmentOrders || []
      const enriched = local.map((a) => {
        const mp = mpList.find((o) => o.id === a.mpOrderId)
        return {
          ...a,
          title: a.title || mp?.title || mp?.recruitmentInfo?.slice(0, 24) || a.mpOrderId,
          status: mp?.status || 'unknown',
        }
      })
      this.setData({ rows: enriched, loading: false })
    } catch {
      this.setData({ rows: local, loading: false })
    }
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
})
