const training = require('../../../utils/mpTraining.js')

const STATUS = {
  escrow: '托管中',
  review: '待核实',
  ready: 'T+1 待打款',
  settled: '已结算',
}

Page({
  data: { orders: [], profile: null, monthTax: 0, monthPayable: 0, netLabel: '0' },
  onShow() {
    this.load()
  },
  async load() {
    const profile = await training.syncProfile()
    const summary = await training.walletSummary().catch(() => null)
    const orders = await training.myOrders()
    const month = new Date().toISOString().slice(0, 7)
    const monthPayable = (orders || [])
      .filter((o) => String(o.createdAt || '').slice(0, 7) === month && o.status !== 'escrow')
      .reduce((sum, o) => sum + Number(o.payable || 0), 0)
    const monthTax = profile && profile.kind === 'person' ? training.laborTax(monthPayable) : 0
    const view = (orders || []).map((o) => ({
      ...o,
      statusText: STATUS[o.status] || o.status,
      net: profile && profile.kind === 'person' ? '' : o.payable,
    }))
    const net = summary && summary.settlement ? Number(summary.settlement.net || 0) : 0
    this.setData({ orders: view, profile, monthTax, monthPayable: Math.round(monthPayable * 100) / 100, netLabel: net.toFixed(2) })
  },
  onWithdraw() {
    wx.showModal({
      title: '提现到绑定账户',
      content: `可提现 ¥${this.data.netLabel}。个人按劳务报酬扣个税，企业不预扣。`,
      confirmText: '确认提现',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await training.withdrawSettlement()
          wx.showToast({ title: '已提现', icon: 'success' })
          this.load()
        } catch (e) {
          wx.showToast({ title: String((e && e.message) || '提现失败').slice(0, 18), icon: 'none' })
        }
      },
    })
  },
  async onEvidence(e) {
    const orderId = e.currentTarget.dataset.id
    wx.showModal({
      title: '提交完成证明',
      editable: true,
      placeholderText: '线上出勤/回放，或线下签到说明',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await training.markReview(orderId, res.content || '')
          this.load()
        } catch (err) {
          wx.showToast({ title: String(err.message || '失败').slice(0, 18), icon: 'none' })
        }
      },
    })
  },
})
