const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const display = require('../../utils/recruitmentDisplay.js')

const STATUS_LABEL = {
  open: '招募中',
  collecting: '收集中',
  closed: '已关闭',
  done: '已完成',
}

Page({
  data: {
    unconfigured: false,
    loading: true,
    err: '',
    rows: [],
  },
  onShow() {
    this.loadList()
  },
  async loadList() {
    if (!merchant.hasMerchantApi()) {
      this.setData({ unconfigured: true, loading: false, rows: [] })
      return
    }
    this.setData({ loading: true, err: '', unconfigured: false })
    try {
      const reg = await ops.fetchRegistry()
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const rows = mpList
        .filter((o) => o && (o.status === 'open' || o.status === 'collecting'))
        .map((mp) => {
          const merchantOrder = display.findMerchantOrder(reg, mp.sourceMerchantOrderId)
          const view = display.enrichMpOrder(mp, merchantOrder)
          return {
            id: mp.id,
            merchantOrderNo: view.merchantOrderNo,
            merchantName: view.merchantName,
            storeName: view.storeName,
            title: view.title,
            statusLabel: STATUS_LABEL[mp.status] || mp.status,
            platform: view.platform,
            fansRequirement: view.fansRequirement,
            budgetText: view.budgetText,
            recruitCount: view.recruitCount,
            region: view.region,
            summary: view.summaryShort,
            applicantCount: view.applicantCount,
          }
        })
      this.setData({ rows, loading: false })
    } catch (e) {
      const msg = String(e.message || e)
      const hint =
        msg.includes('fail') || msg.includes('网络')
          ? '无法连接后台，请确认已运行 npm run dev，且 config.local.js 中 MERCHANT_API_BASE_URL 正确（模拟器可用 http://127.0.0.1:5173）'
          : msg
      this.setData({ loading: false, err: hint, rows: [] })
    }
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
})
