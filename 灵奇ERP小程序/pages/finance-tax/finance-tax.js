const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')
const tax = require('../../utils/taxFilingMp.js')

Page({
  data: {
    periodOffset: -1,
    periodLabel: '',
    periodRange: '',
    loading: false,
    err: '',
    rows: [],
    totalSales: 0,
    totalVerify: 0,
    history: [],
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
  onPrevMonth() {
    this.setData({ periodOffset: this.data.periodOffset - 1 })
    void this.load()
  },
  onNextMonth() {
    if (this.data.periodOffset >= 0) return
    this.setData({ periodOffset: this.data.periodOffset + 1 })
    void this.load()
  },
  async load() {
    const period = tax.shanghaiMonthRangeYmd(this.data.periodOffset)
    this.setData({
      loading: true,
      err: '',
      periodLabel: period.label,
      periodRange: `${period.start} ~ ${period.end}`,
    })
    const r = await feature.fetchFinanceReconcile(tax.daysCovering(period.start))
    if (!r.ok) {
      this.setData({ loading: false, err: r.message, rows: [], history: tax.readHistory() })
      return
    }
    const rows = tax.aggregateRows(r.rows, period.start, period.end)
    const totalSales = rows.reduce((s, x) => s + (Number(x.sales) || 0), 0)
    const totalVerify = rows.reduce((s, x) => s + (Number(x.verify) || 0), 0)
    this.setData({
      loading: false,
      rows,
      totalSales: Math.round(totalSales * 100) / 100,
      totalVerify: Math.round(totalVerify * 100) / 100,
      history: tax.readHistory(),
    })
  },
  onCopyPack() {
    const payload = {
      period: this.data.periodLabel,
      range: this.data.periodRange,
      totalSales: this.data.totalSales,
      totalVerify: this.data.totalVerify,
      platforms: this.data.rows,
    }
    wx.setClipboardData({
      data: JSON.stringify(payload, null, 2),
      success: () => wx.showToast({ title: '已复制申报包 JSON', icon: 'none' }),
    })
  },
  onFileOnce() {
    if (!this.data.rows.length) {
      wx.showToast({ title: '暂无对账数据', icon: 'none' })
      return
    }
    this.onCopyPack()
    const period = tax.shanghaiMonthRangeYmd(this.data.periodOffset)
    const history = tax.appendHistory({
      id: `TAX-${Date.now()}`,
      periodLabel: period.label,
      startDate: period.start,
      endDate: period.end,
      submittedAt: new Date().toISOString(),
      totalVerifyYuan: this.data.totalVerify,
      status: 'submitted_mock',
    })
    this.setData({ history })
  },
  onOpenReconcile() {
    wx.navigateTo({ url: '/pages/finance-reconcile/finance-reconcile' })
  },
})
