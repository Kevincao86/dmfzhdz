const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryMp.js')
const rest = require('../../utils/supabaseRest.js')

function statusLabel(st) {
  if (st === 'accepted') return '已接单'
  if (st === 'done') return '已完成'
  if (st === 'cancelled') return '已取消'
  if (st === 'refunded') return '已退款'
  return '待接单'
}

Page({
  data: {
    loading: true,
    unconfigured: false,
    err: '',
    filterHint: '',
    rows: [],
  },

  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    if (!merchant.hasMerchantApi()) {
      this.setData({ loading: false, unconfigured: true, err: '', rows: [], filterHint: '' })
      return
    }
    this.setData({ unconfigured: false })
    void this.loadList()
  },

  onPullDownRefresh() {
    void this.loadList().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadList() {
    if (!merchant.hasMerchantApi()) return
    this.setData({ loading: true, err: '' })
    try {
      let merchantName = ''
      try {
        const tid = await rest.fetchPrimaryTenantId()
        merchantName = (await rest.fetchTenantMerchantName(tid)) || ''
      } catch (_) {
        /* 缺表或未迁移 */
      }
      const reg = await ops.fetchRegistry()
      let list = Array.isArray(reg.recruitmentOrders) ? reg.recruitmentOrders : []
      let filterHint = ''
      if (merchantName) {
        list = list.filter((o) => String(o.customerName || '').trim() === merchantName)
      } else {
        filterHint = '（暂时无法识别门店名称，以下为全部招募单）'
      }
      const rows = list.slice(0, 80).map((o) =>
        Object.assign({}, o, {
          statusLabel: statusLabel(o.status),
        }),
      )
      this.setData({
        loading: false,
        rows,
        filterHint,
      })
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      this.setData({
        loading: false,
        err: msg,
        rows: [],
        filterHint: '',
      })
    }
  },

})
