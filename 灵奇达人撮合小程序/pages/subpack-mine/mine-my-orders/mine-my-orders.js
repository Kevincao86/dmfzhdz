const mpMembershipApi = require('../../../utils/mpMembershipApi.js')
const mpMembershipUi = require('../../../utils/mpMembershipUi.js')
const { prepareXingxuanSubPage } = require('../../../utils/pageIdentityChrome.js')
const guestRoutes = require('../../../utils/mpGuestRoutes.js')
const ecs = require('../../../utils/ecs.js')
const sessionStore = require('../../../utils/mpSessionStore.js')
const userProfile = require('../../../utils/userProfile.js')
const training = require('../../../utils/mpTraining.js')
const affiliate = require('../../../utils/mpDistributionAffiliatePortal.js')

const VALID_TABS = ['spend', 'quota', 'membership', 'recharge', 'withdraw']

function parseTab(raw) {
  const tab = String(raw || '').trim()
  if (tab === 'quota' || tab === 'package') return 'quota'
  if (tab === 'membership') return 'membership'
  if (tab === 'recharge' || tab === 'points') return 'recharge'
  if (tab === 'withdraw') return 'withdraw'
  if (tab === 'spend' || tab === 'all') return 'spend'
  return VALID_TABS.includes(tab) ? tab : 'spend'
}

function clipTime(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ')
}

function withdrawStatusClass(status) {
  if (status === 'paid') return 'confirmed'
  if (status === 'rejected' || status === 'failed') return 'rejected'
  return 'pending'
}

const AFFILIATE_STATUS = {
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  paid: '提现成功',
  failed: '打款失败',
}

async function loadWithdrawRows() {
  const rows = []
  try {
    const token = sessionStore.readSessionToken()
    const cash = await ecs.post(
      '/api/meoo-mp-pr-cash-wallet',
      { action: 'summary', workIdentity: userProfile.readIdentity(), allWithdraws: true },
      { 'X-Mp-Session': token },
    )
    ;(cash && cash.withdraws ? cash.withdraws : []).forEach((item) => {
      const createdAt = String(item.createdAt || '')
      const paidAt = item.paidAt ? String(item.paidAt) : ''
      const bankTail = item.bankTail ? String(item.bankTail) : ''
      rows.push({
        id: `cash-${item.id || createdAt}`,
        kindLabel: '活动红包',
        amountYuan: String(item.amountYuan || '0.00'),
        statusText: String(item.statusText || (item.status === 'paid' ? '提现成功' : '待打款')),
        statusClass: withdrawStatusClass(item.status),
        createdAt,
        detail: [`申请 ${clipTime(createdAt)}`, paidAt ? `打款 ${clipTime(paidAt)}` : '', bankTail ? `尾号${bankTail}` : '']
          .filter(Boolean)
          .join(' · '),
      })
    })
  } catch (_) {}
  try {
    const summary = await training.walletSummary()
    ;(summary.payouts || []).forEach((item) => {
      const createdAt = String(item.createdAt || '')
      const paidAt = item.paidAt ? String(item.paidAt) : ''
      const status = item.status === 'paid' ? 'paid' : 'pending'
      rows.push({
        id: `train-${item.id || createdAt}`,
        kindLabel: '培训结算',
        amountYuan: Number(item.net || 0).toFixed(2),
        statusText: status === 'paid' ? '提现成功' : '待打款',
        statusClass: withdrawStatusClass(status),
        createdAt,
        detail: [`申请 ${clipTime(createdAt)}`, paidAt ? `打款 ${clipTime(paidAt)}` : ''].filter(Boolean).join(' · '),
      })
    })
  } catch (_) {}
  try {
    const portal = await affiliate.fetchPortal()
    ;(portal.withdrawRequests || []).forEach((item) => {
      const createdAt = String(item.createdAt || '')
      const paidAt = item.paidAt ? String(item.paidAt) : ''
      rows.push({
        id: `aff-${item.id || createdAt}`,
        kindLabel: '推广佣金',
        amountYuan: (Math.max(0, Number(item.amountCents) || 0) / 100).toFixed(2),
        statusText: AFFILIATE_STATUS[item.status] || String(item.status || '待审核'),
        statusClass: withdrawStatusClass(item.status),
        createdAt,
        detail: [`申请 ${clipTime(createdAt)}`, paidAt ? `打款 ${clipTime(paidAt)}` : '', item.failReason || '']
          .filter(Boolean)
          .join(' · '),
      })
    })
  } catch (_) {}
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return rows
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
      usageLedger: [],
    }
  }
  const summary = raw.pointsSummary && typeof raw.pointsSummary === 'object' ? raw.pointsSummary : null
  const quotaRows = Array.isArray(raw.quotaRows) ? raw.quotaRows : []
  const mapLedgerRow = (row) => ({
    id: String(row.id || row.createdAt || ''),
    kindLabel: String(row.kindLabel || row.kind || '积分'),
    points: Number(row.points || 0),
    balanceAfter: Number(row.balanceAfter || 0),
    note: String(row.note || '').trim(),
    chargeSummary: String(row.chargeSummary || '').trim() || `消耗 ${Number(row.points || 0)} 积分`,
    createdAtLabel: mpMembershipUi.fmtTime(row.createdAt),
  })
  const usageLedger = Array.isArray(raw.usageLedger)
    ? raw.usageLedger.map(mapLedgerRow)
    : Array.isArray(raw.pointsLedger)
      ? raw.pointsLedger.map(mapLedgerRow)
      : []
  const ledger = Array.isArray(raw.pointsLedger) ? raw.pointsLedger.map(mapLedgerRow) : []
  return {
    deductOrderNote: String(raw.deductOrderNote || 'AI 功能按积分扣减（套餐赠送积分优先）；余额不足请充值或升级套餐。'),
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
    usageLedger,
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
    withdraws: [],
    usage: {
      deductOrderNote: '',
      quotaMonth: '',
      pointsSummary: null,
      quotaRows: [],
      pointsLedger: [],
      usageLedger: [],
    },
  },
  onLoad(options) {
    const highlightOutTradeNo = String(options.outTradeNo || '').trim()
    this.setData({ tab: parseTab(options.tab), highlightOutTradeNo })
  },
  async onShow() {
    const ok = await prepareXingxuanSubPage(this)
    if (!ok) {
      guestRoutes.redirectToLogin('/pages/subpack-mine/mine-my-orders/mine-my-orders')
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
    const withdraws = await loadWithdrawRows()
    try {
      const data = await mpMembershipApi.fetchMyPaymentOrders()
      this._membershipOrders = data.membershipOrders || []
      this._pointsOrders = data.pointsOrders || []
      this.setData({
        loading: false,
        usage: mapUsage(data.usage),
        withdraws,
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
      this._membershipOrders = []
      this._pointsOrders = []
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e),
        visibleOrders: [],
        empty: false,
        withdraws,
      })
    }
  },
})
