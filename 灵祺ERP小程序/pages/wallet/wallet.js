const tiersUtil = require('../../utils/meooPaymentTiers.js')
const rest = require('../../utils/supabaseRest.js')
const devAuth = require('../../utils/devAuth.js')
const walletUi = require('../../utils/walletUiMp.js')
const billing = require('../../utils/tenantBillingApiMp.js')
const payFlow = require('../../utils/tenantPayFlowMp.js')
const payChannels = require('../../utils/tenantPayChannelsMp.js')

function formatPointsLedgerRow(row) {
  const pkg = Number(row.delta_package_points) || 0
  const rech = Number(row.delta_recharge_points) || 0
  const delta = pkg + rech
  let t = row.created_at || ''
  try {
    t = new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  } catch (_) {}
  return {
    id: row.id,
    reason: row.reason || '积分变动',
    delta,
    deltaText: delta >= 0 ? `+${delta}` : String(delta),
    created_at: t,
  }
}

Page({
  data: {
    accountBalanceYuan: '0.00',
    pointsBalanceText: '0',
    packagePointsText: '0',
    rechargePointsText: '0',
    pointsPerYuan: walletUi.POINTS_PER_YUAN,
    briefPointsCost: walletUi.BRIEF_POINTS_COST,
    balanceCents: 0,
    pointsLedger: [],
    loading: false,
    err: '',
    payOpen: false,
    payMode: '',
    payTitle: '',
    payTiers: [],
    refundOpen: false,
    refundYuan: '',
    refundBusy: false,
    refundErr: '',
    tierIndex: 0,
    useCustom: false,
    customYuan: '',
    payStep: 'choose',
    channel: '',
    payBusy: false,
    payErr: '',
    qrUrl: '',
    remainSecText: '05:00',
    polling: false,
    channels: payChannels.TENANT_PAY_CHANNELS,
  },

  onUnload() {
    this.stopPayTimers()
  },

  onHide() {
    this.stopPayTimers()
  },

  onShow() {
    const app = getApp()
    if (!app.ensureAuthed()) return
    this.reload()
  },

  noop() {},

  stopPayTimers() {
    if (this._pollStop) {
      this._pollStop()
      this._pollStop = null
    }
    if (this._countdown && this._countdown.stop) {
      this._countdown.stop()
      this._countdown = null
    }
  },

  async reload() {
    this.setData({ loading: true, err: '' })
    try {
      const summary = await billing.fetchTenantBillingSummary()
      const ledgerRaw = await billing.fetchTenantPointsLedger()
      const bc = typeof summary.walletBalanceCents === 'number' ? summary.walletBalanceCents : 0
      const totalPts = typeof summary.totalPoints === 'number' ? summary.totalPoints : 0
      const pkgPts = typeof summary.packagePoints === 'number' ? summary.packagePoints : 0
      const rechPts = typeof summary.rechargePoints === 'number' ? summary.rechargePoints : 0
      this.setData({
        accountBalanceYuan: tiersUtil.formatYuanFromCents(bc),
        balanceCents: bc,
        pointsBalanceText: walletUi.formatPoints(totalPts),
        packagePointsText: walletUi.formatPoints(pkgPts),
        rechargePointsText: walletUi.formatPoints(rechPts),
        pointsLedger: (ledgerRaw || []).slice(0, 20).map(formatPointsLedgerRow),
        loading: false,
      })
    } catch (e) {
      if (devAuth.isDevSkipLogin()) {
        this.setData({
          accountBalanceYuan: '251.60',
          balanceCents: 25160,
          pointsBalanceText: '12,580',
          packagePointsText: '2,000',
          rechargePointsText: '10,580',
          pointsLedger: [],
          loading: false,
          err: '',
        })
        return
      }
      this.setData({
        err: payFlow.formatPayError(e),
        loading: false,
      })
    }
  },

  onShowLedger() {
    if (!this.data.pointsLedger.length) {
      wx.showToast({ title: '暂无积分明细', icon: 'none' })
      return
    }
    wx.pageScrollTo({ scrollTop: 9999, duration: 300 })
  },

  onOpenAccountRecharge() {
    this.openPaySheet('recharge', '账户余额充值', tiersUtil.RECHARGE_TIERS)
  },

  onOpenPointsRecharge() {
    this.openPaySheet('points_recharge', '积分充值', tiersUtil.POINTS_RECHARGE_TIERS)
  },

  openPaySheet(mode, title, tiers) {
    this.stopPayTimers()
    this.setData({
      payOpen: true,
      payMode: mode,
      payTitle: title,
      payTiers: tiers,
      payStep: 'choose',
      channel: 'wechat',
      tierIndex: 0,
      useCustom: false,
      customYuan: '',
      payErr: '',
      qrUrl: '',
      remainSecText: '05:00',
      polling: false,
    })
  },

  onClosePay() {
    this.stopPayTimers()
    this.setData({
      payOpen: false,
      payBusy: false,
      payErr: '',
      qrUrl: '',
      polling: false,
    })
  },

  onOpenRefund() {
    if (this.data.balanceCents <= 0) return
    this.setData({ refundOpen: true, refundYuan: '', refundErr: '' })
  },

  onCloseRefund() {
    if (this.data.refundBusy) return
    this.setData({ refundOpen: false, refundErr: '' })
  },

  onRefundYuan(e) {
    this.setData({ refundYuan: e.detail.value, refundErr: '' })
  },

  async submitRefund(cents) {
    const bc = this.data.balanceCents
    if (!Number.isFinite(cents) || cents <= 0) {
      this.setData({ refundErr: '请输入有效退款金额' })
      return
    }
    if (cents > bc) {
      this.setData({ refundErr: '退款金额不能大于可用余额' })
      return
    }
    this.setData({ refundBusy: true, refundErr: '' })
    try {
      const tid = await rest.fetchPrimaryTenantId()
      await rest.insertPaymentOrder({
        tenantId: tid,
        orderKind: 'refund',
        amountCents: cents,
      })
      wx.showToast({ title: '已提交退款申请', icon: 'success' })
      this.setData({ refundOpen: false, refundBusy: false, refundYuan: '' })
      this.reload()
    } catch (e) {
      this.setData({ refundBusy: false, refundErr: payFlow.formatPayError(e) })
    }
  },

  async onRefundConfirm() {
    const cents = tiersUtil.yuanRefundInputToCents(this.data.refundYuan)
    if (cents === null) {
      this.setData({ refundErr: '请输入大于 0 的金额（最小 ¥0.01）' })
      return
    }
    await this.submitRefund(cents)
  },

  onRefundAll() {
    const bc = this.data.balanceCents
    if (bc <= 0 || this.data.refundBusy) return
    wx.showModal({
      title: '是否全部退款？',
      content: `将把当前可用余额 ¥${tiersUtil.formatYuanFromCents(bc)} 全部发起退款申请，提交后进入客服审核流程。`,
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        void this.submitRefund(bc)
      },
    })
  },

  onPickTier(e) {
    this.setData({ tierIndex: Number(e.currentTarget.dataset.index) || 0, useCustom: false })
  },

  onToggleCustom(e) {
    this.setData({ useCustom: !!e.detail.value })
  },

  onCustomYuan(e) {
    this.setData({ customYuan: e.detail.value })
  },

  resolveCents() {
    if (this.data.useCustom) return tiersUtil.yuanInputToCents(this.data.customYuan)
    const t = this.data.payTiers[this.data.tierIndex]
    return t ? t.cents : null
  },

  canWalletPay() {
    return this.data.payMode === 'points_recharge'
  },

  onBackChoose() {
    this.stopPayTimers()
    this.setData({
      payStep: 'choose',
      channel: 'wechat',
      payErr: '',
      qrUrl: '',
      polling: false,
      remainSecText: '05:00',
    })
  },

  async onWalletPay() {
    const cents = this.resolveCents()
    if (cents === null) {
      this.setData({ payErr: '请选择有效档位或填写自定义金额' })
      return
    }
    const bc = this.data.balanceCents
    if (bc < cents) {
      this.setData({
        payErr: `余额不足，当前可用 ¥${tiersUtil.formatYuanFromCents(bc)}，应付 ¥${tiersUtil.formatYuanFromCents(cents)}`,
      })
      return
    }
    this.setData({ payBusy: true, payErr: '' })
    try {
      await billing.tenantWalletPay({
        orderKind: 'points_recharge',
        amountCents: cents,
      })
      wx.showToast({ title: '积分充值成功', icon: 'success' })
      this.onClosePay()
      this.reload()
    } catch (e) {
      this.setData({ payBusy: false, payErr: payFlow.formatPayError(e) })
    }
  },

  async onPickChannel(e) {
    const ch = e.currentTarget.dataset.ch
    const cents = this.resolveCents()
    if (cents === null) {
      wx.showToast({ title: '金额无效', icon: 'none' })
      return
    }
    this.setData({ channel: ch, payBusy: true, payErr: '' })
    try {
      const result = await payFlow.startOnlinePay({
        orderKind: this.data.payMode,
        amountCents: cents,
        channel: ch,
      })
      if (ch === 'wechat' && result.payMode === 'wechat_jsapi') {
        wx.showToast({ title: '支付成功', icon: 'success' })
        this.onClosePay()
        this.reload()
        return
      }
      const deadlineMs = Date.now() + payFlow.TENANT_ONLINE_PAY_TTL_MS
      this.setData({
        payStep: 'pay',
        payBusy: false,
        qrUrl: result.qrUrl,
        polling: true,
      })
      this._countdown = payFlow.createPayCountdown(
        deadlineMs,
        (_left, text) => this.setData({ remainSecText: text }),
        () => {
          this.stopPayTimers()
          this.onClosePay()
          wx.showToast({ title: '支付已超时', icon: 'none' })
        },
      )
      this._pollStop = () => {}
      payFlow
        .pollPayUntilDone(result.outTradeNo)
        .then(() => {
          this.stopPayTimers()
          wx.showToast({ title: '支付成功', icon: 'success' })
          this.onClosePay()
          this.reload()
        })
        .catch((err) => {
          this.stopPayTimers()
          this.setData({
            payStep: 'choose',
            polling: false,
            payErr: payFlow.formatPayError(err),
          })
        })
    } catch (e) {
      this.setData({ payBusy: false, payErr: payFlow.formatPayError(e) })
    }
  },
})
