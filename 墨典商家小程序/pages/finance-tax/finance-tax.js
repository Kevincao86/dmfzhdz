const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')

Page({
  data: { days: 30, loading: false, err: '', rows: [] },
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
  async onLoad() {
    this.setData({ loading: true, err: '', rows: [] })
    const r = await feature.fetchFinanceReconcile(this.data.days)
    if (!r.ok) {
      this.setData({ loading: false, err: r.message })
      return
    }
    const map = {}
    for (const row of r.rows) {
      const k = row.platformLabel || row.platform
      if (!map[k]) map[k] = { platformLabel: k, sales: 0, verify: 0 }
      map[k].sales += Number(row.salesAmountYuan) || 0
      map[k].verify += Number(row.verifyAmountYuan) || 0
    }
    const rows = Object.keys(map).map((key) => ({
      key,
      platformLabel: map[key].platformLabel,
      sales: Math.round(map[key].sales * 100) / 100,
      verify: Math.round(map[key].verify * 100) / 100,
    }))
    this.setData({ loading: false, rows })
  },
})
