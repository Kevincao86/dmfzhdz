const mpMembershipApi = require('../../utils/mpMembershipApi.js')
const mpMembershipUi = require('../../utils/mpMembershipUi.js')
const { prepareXingxuanSubPage } = require('../../utils/pageIdentityChrome.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')

function mapMembershipOrder(row, highlightOutTradeNo) {
  const outTradeNo = String(row.outTradeNo || '').trim()
  return {
    key: `m-${row.id || outTradeNo || row.createdAt}`,
    kind: 'membership',
    kindLabel: '会员开通',
    title: `${mpMembershipUi.planLabel(row.planId)} · ${mpMembershipUi.billingLabel(row.billing)}`,
    status: row.status || 'pending',
    statusLabel: mpMembershipUi.orderStatusLabel(row.status),
    amountYuan: mpMembershipUi.yuanFromCents(row.amountCents),
    payModeLabel: mpMembershipUi.payModeLabel(row.payMode),
    createdAtLabel: mpMembershipUi.fmtTime(row.createdAt),
    paidAtTitle: '支付时间',
    paidAtLabel: row.paidAt ? mpMembershipUi.fmtTime(row.paidAt) : '—',
    outTradeNo,
    highlight: highlightOutTradeNo && outTradeNo === highlightOutTradeNo,
  }
}

function mapPointsOrder(row, highlightOutTradeNo) {
  const outTradeNo = String(row.outTradeNo || '').trim()
  return {
    key: `p-${row.id || outTradeNo || row.createdAt}`,
    kind: 'points',
    kindLabel: '积分充值',
    title: `${Number(row.points || 0).toLocaleString('zh-CN')} 积分`,
    status: row.status || 'pending',
    statusLabel: mpMembershipUi.orderStatusLabel(row.status),
    amountYuan: mpMembershipUi.yuanFromCents(row.amountCents),
    payModeLabel: mpMembershipUi.payModeLabel(row.payMode),
    createdAtLabel: mpMembershipUi.fmtTime(row.createdAt),
    paidAtTitle: '到账时间',
    paidAtLabel: row.paidAt ? mpMembershipUi.fmtTime(row.paidAt) : '—',
    outTradeNo,
    highlight: highlightOutTradeNo && outTradeNo === highlightOutTradeNo,
  }
}

Page({
  data: {
    lqThemeClass: 'lq-theme-pr',
    tab: 'all',
    loading: true,
    err: '',
    empty: false,
    visibleOrders: [],
    highlightOutTradeNo: '',
  },
  onLoad(options) {
    const tab = String(options.tab || 'all').trim()
    const safeTab = tab === 'membership' || tab === 'points' ? tab : 'all'
    const highlightOutTradeNo = String(options.outTradeNo || '').trim()
    this.setData({ tab: safeTab, highlightOutTradeNo })
  },
  async onShow() {
    const ok = await prepareXingxuanSubPage(this)
    if (!ok) {
      guestRoutes.redirectToLogin('/pages/mine-my-orders/mine-my-orders')
      return
    }
    await this.loadOrders()
  },
  onPickTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.tab) return
    this.setData({ tab })
    this.applyFilter(this._membershipOrders || [], this._pointsOrders || [])
  },
  onReload() {
    void this.loadOrders()
  },
  applyFilter(membershipOrders, pointsOrders) {
    const tab = this.data.tab
    const highlightOutTradeNo = this.data.highlightOutTradeNo
    let list = []
    if (tab === 'membership') {
      list = membershipOrders.map((r) => mapMembershipOrder(r, highlightOutTradeNo))
    } else if (tab === 'points') {
      list = pointsOrders.map((r) => mapPointsOrder(r, highlightOutTradeNo))
    } else {
      list = [
        ...membershipOrders.map((r) => mapMembershipOrder(r, highlightOutTradeNo)),
        ...pointsOrders.map((r) => mapPointsOrder(r, highlightOutTradeNo)),
      ].sort((a, b) => String(b.createdAtLabel).localeCompare(String(a.createdAtLabel)))
    }
    this.setData({
      visibleOrders: list,
      empty: list.length === 0,
    })
  },
  async loadOrders() {
    this.setData({ loading: true, err: '' })
    try {
      const data = await mpMembershipApi.fetchMyPaymentOrders()
      this._membershipOrders = data.membershipOrders || []
      this._pointsOrders = data.pointsOrders || []
      this.setData({ loading: false })
      this.applyFilter(this._membershipOrders, this._pointsOrders)
      const highlight = this.data.highlightOutTradeNo
      if (highlight) {
        const pending = [...this._membershipOrders, ...this._pointsOrders].find(
          (r) => String(r.outTradeNo || '').trim() === highlight && r.status === 'pending',
        )
        if (pending) {
          try {
            await mpMembershipApi.pollMembershipWechatPay(highlight)
            const refreshed = await mpMembershipApi.fetchMyPaymentOrders()
            this._membershipOrders = refreshed.membershipOrders || []
            this._pointsOrders = refreshed.pointsOrders || []
            this.applyFilter(this._membershipOrders, this._pointsOrders)
          } catch (_) {}
        }
      }
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e),
        visibleOrders: [],
        empty: false,
      })
    }
  },
})
