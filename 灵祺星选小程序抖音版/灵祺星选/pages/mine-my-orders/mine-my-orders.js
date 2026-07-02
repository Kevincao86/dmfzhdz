const mpMembershipApi = require('../../utils/mpMembershipApi.js')
const mpMembershipUi = require('../../utils/mpMembershipUi.js')
const { prepareXingxuanSubPage } = require('../../utils/pageIdentityChrome.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')

const VALID_TABS = ['spend', 'quota', 'membership', 'recharge']

function parseTab(raw) {
  const tab = String(raw || '').trim()
  if (tab === 'quota' || tab === 'package') return 'quota'
  if (tab === 'membership') return 'membership'
  if (tab === 'recharge' || tab === 'points') return 'recharge'
  if (tab === 'spend' || tab === 'all') return 'spend'
  return VALID_TABS.includes(tab) ? tab : 'spend'
}

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

function mapUsage(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      deductOrderNote: '',
      quotaMonth: '',
      pointsSummary: null,
      quotaRows: [],
      pointsLedger: [],
    }
  }
  const summary = raw.pointsSummary && typeof raw.pointsSummary === 'object' ? raw.pointsSummary : null
  const quotaRows = Array.isArray(raw.quotaRows) ? raw.quotaRows : []
  const ledger = Array.isArray(raw.pointsLedger)
    ? raw.pointsLedger.map((row) => ({
        id: String(row.id || row.createdAt || ''),
        kindLabel: String(row.kindLabel || row.kind || '积分'),
        points: Number(row.points || 0),
        balanceAfter: Number(row.balanceAfter || 0),
        note: String(row.note || '').trim(),
        createdAtLabel: mpMembershipUi.fmtTime(row.createdAt),
      }))
    : []
  return {
    deductOrderNote: String(raw.deductOrderNote || '先消耗套餐额度，用尽后再扣积分。'),
    quotaMonth: String(raw.quotaMonth || ''),
    pointsSummary: summary
      ? {
          balance: Number(summary.balance || 0),
          packageRemaining: Number(summary.packageRemaining || 0),
          rechargeBalance: Number(summary.rechargeBalance || 0),
          monthlySpent: Number(summary.monthlySpent || 0),
        }
      : null,
    quotaRows,
    pointsLedger: ledger,
  }
}

Page({
  data: {
    lqThemeClass: 'lq-theme-pr',
    tab: 'spend',
    loading: true,
    err: '',
    empty: false,
    visibleOrders: [],
    highlightOutTradeNo: '',
    usage: {
      deductOrderNote: '',
      quotaMonth: '',
      pointsSummary: null,
      quotaRows: [],
      pointsLedger: [],
    },
  },
  onLoad(options) {
    const highlightOutTradeNo = String(options.outTradeNo || '').trim()
    this.setData({ tab: parseTab(options.tab), highlightOutTradeNo })
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
    const tab = parseTab(e.currentTarget.dataset.tab)
    if (tab === this.data.tab) return
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
    } else if (tab === 'recharge') {
      list = pointsOrders.map((r) => mapPointsOrder(r, highlightOutTradeNo))
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
      this.setData({
        loading: false,
        usage: mapUsage(data.usage),
      })
      this.applyFilter(this._membershipOrders, this._pointsOrders)
      const highlight = this.data.highlightOutTradeNo
      if (highlight) {
        const pending = [...this._membershipOrders, ...this._pointsOrders].find(
          (r) => String(r.outTradeNo || '').trim() === highlight && r.status === 'pending',
        )
        if (pending) {
          try {
            const isPoints = Number(pending.points || 0) > 0
            if (isPoints) {
              await mpMembershipApi.pollPointsWechatPay(highlight)
              this.setData({ tab: 'recharge' })
            } else {
              await mpMembershipApi.pollMembershipWechatPay(highlight)
              this.setData({ tab: 'membership' })
            }
            const refreshed = await mpMembershipApi.fetchMyPaymentOrders()
            this._membershipOrders = refreshed.membershipOrders || []
            this._pointsOrders = refreshed.pointsOrders || []
            this.setData({ usage: mapUsage(refreshed.usage) })
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
