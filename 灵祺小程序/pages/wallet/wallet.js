const tiersUtil = require('../../utils/meooPaymentTiers.js')
const rest = require('../../utils/supabaseRest.js')

function formatLedgerRow(row) {
  const dc = typeof row.delta_cents === 'number' ? row.delta_cents : 0
  const bal = typeof row.balance_after_cents === 'number' ? row.balance_after_cents : 0
  let t = row.created_at || ''
  try {
    t = new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  } catch (_) {}
  return {
    ...row,
    deltaAbsYuan: tiersUtil.formatYuanFromCents(Math.abs(dc)),
    balanceYuan: tiersUtil.formatYuanFromCents(bal),
    created_at: t,
  }
}

function formatReqErr(e) {
  if (e && typeof e.message === 'string' && e.message) return e.message
  try {
    return typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e)
  } catch (_) {
    return String(e)
  }
}

Page({
  data: {
    balanceYuan: '0.00',
    balanceCents: 0,
    expireText: '',
    ledger: [],
    loading: false,
    err: '',
    payOpen: false,
    refundOpen: false,
    refundYuan: '',
    refundBusy: false,
    refundErr: '',
    rechargeTiers: tiersUtil.RECHARGE_TIERS,
    tierIndex: 0,
    useCustom: false,
    customYuan: '',
    payStep: 'choose',
    channel: '',
    payBusy: false,
    payErr: '',
  },

  onShow() {
    const app = getApp()
    if (!app.ensureAuthed()) return
    this.reload()
  },

  noop() {},

  async reload() {
    this.setData({ loading: true, err: '' })
    try {
      const tid = await rest.fetchPrimaryTenantId()
      const s = await rest.fetchTenantWalletSummary(tid)
      const ledger = (s.ledger || []).map(formatLedgerRow)
      let expireText = ''
      if (s.serviceExpireAt) {
        try {
          expireText = new Date(s.serviceExpireAt).toLocaleString('zh-CN', { hour12: false })
        } catch (_) {
          expireText = String(s.serviceExpireAt)
        }
      }
      const bc = typeof s.balanceCents === 'number' ? s.balanceCents : 0
      this.setData({
        balanceYuan: tiersUtil.formatYuanFromCents(bc),
        balanceCents: bc,
        expireText,
        ledger,
        loading: false,
      })
    } catch (e) {
      const msg = formatReqErr(e)
      this.setData({
        err: /relation|does not exist/i.test(msg)
          ? '钱包功能尚未在后台就绪，请联系技术支持完成初始化。'
          : msg,
        loading: false,
      })
    }
  },

  onReload() {
    this.reload()
  },

  onOpenRecharge() {
    this.setData({
      payOpen: true,
      payStep: 'choose',
      channel: '',
      tierIndex: 0,
      useCustom: false,
      customYuan: '',
      payErr: '',
    })
  },

  onClosePay() {
    this.setData({
      payOpen: false,
      payBusy: false,
      payErr: '',
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
      this.setData({ refundBusy: false, refundErr: formatReqErr(e) })
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
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ tierIndex: index, useCustom: false })
  },

  onToggleCustom(e) {
    this.setData({ useCustom: !!e.detail.value })
  },

  onCustomYuan(e) {
    this.setData({ customYuan: e.detail.value })
  },

  onPickChannel(e) {
    const ch = e.currentTarget.dataset.ch
    const cents = this.resolveCents()
    if (cents === null) {
      wx.showToast({ title: '金额无效', icon: 'none' })
      return
    }
    this.setData({ channel: ch, payStep: 'pay', payErr: '' })
  },

  onBackChoose() {
    this.setData({ payStep: 'choose', channel: '', payErr: '' })
  },

  resolveCents() {
    if (this.data.useCustom) return tiersUtil.yuanInputToCents(this.data.customYuan)
    const t = this.data.rechargeTiers[this.data.tierIndex]
    return t ? t.cents : null
  },

  async onPaid() {
    const cents = this.resolveCents()
    if (cents === null) {
      this.setData({ payErr: '金额无效' })
      return
    }
    const ch = this.data.channel === 'alipay' ? 'alipay' : 'wechat'
    this.setData({ payBusy: true, payErr: '' })
    try {
      const tid = await rest.fetchPrimaryTenantId()
      await rest.insertPaymentOrder({
        tenantId: tid,
        orderKind: 'recharge',
        amountCents: cents,
        payChannel: ch,
      })
      wx.showToast({ title: '已提交申报', icon: 'success' })
      this.setData({ payOpen: false, payBusy: false })
      this.reload()
    } catch (e) {
      this.setData({ payBusy: false, payErr: formatReqErr(e) })
    }
  },
})
