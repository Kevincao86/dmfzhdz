const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')

Page({
  data: { days: 14, loading: false, err: '', items: [] },
  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.load()
  },
  async load() {
    this.setData({ loading: true, err: '' })
    const r = await feature.fetchFinanceReconcile(this.data.days)
    const items = r.ok
      ? r.rows.map((row, idx) => ({
          idx,
          platformLabel: row.platformLabel || row.platform,
          date: row.date,
          orderCount: row.orderCount,
          verifyOrderCount: row.verifyOrderCount,
          salesAmountYuan: row.salesAmountYuan,
          verifyAmountYuan: row.verifyAmountYuan,
        }))
      : []
    this.setData({
      loading: false,
      err: r.ok ? '' : r.message,
      items,
    })
  },
})
