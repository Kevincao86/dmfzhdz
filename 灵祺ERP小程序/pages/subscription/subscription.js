const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const membershipMp = require('../../utils/membershipMp.js')
const tiersUtil = require('../../utils/meooPaymentTiers.js')
const billing = require('../../utils/tenantBillingApiMp.js')
const payFlow = require('../../utils/tenantPayFlowMp.js')
const payChannels = require('../../utils/tenantPayChannelsMp.js')
const subUi = require('../../utils/subscriptionUiMp.js')

function displayPlanFromTier(tierId) {
  if (tierId === 'flagship') return '旗舰版'
  if (tierId === 'pro') return '专业版'
  return '基础版'
}

Page({
  data: {
    loading: true,
    planLabel: '免费版',
    displayPlanLabel: '专业版',
    monthlyYuan: null,
    featureLines: [],
    directAiRemaining: null,
    directAiLimit: null,
    isPaid: false,
    subscriptionDays: 0,
    opsGiftDays: 0,
    totalEntitlementDays: 0,
    remainDaysDisplay: '0',
    expireText: '',
    expireWarn: '',
    walletBalanceCents: 0,
    walletBalanceYuan: '0.00',
    subscriptionTiers: tiersUtil.SUBSCRIPTION_TIERS,
    tierIndex: 0,
    channel: '',
    payBusy: false,
    payErr: '',
    paySheetOpen: false,
    payStep: 'choose',
    qrUrl: '',
    remainSecText: '05:00',
    polling: false,
    channels: payChannels.TENANT_PAY_CHANNELS,
    tiers: subUi.TIERS,
    activeTierId: 'pro',
    currentTierId: 'pro',
    featureTable: subUi.buildTable('pro'),
  },

  onUnload() {
    this.stopPayTimers()
  },

  onHide() {
    this.stopPayTimers()
  },

  onShow() {
    if (!api.canAccessPage()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.reload()
  },

  noop() {},

  stopPayTimers() {
    if (this._countdown && this._countdown.stop) {
      this._countdown.stop()
      this._countdown = null
    }
  },

  onPickDisplayTier(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activeTierId) return
    this.setData({
      activeTierId: id,
      featureTable: subUi.buildTable(id),
      displayPlanLabel: displayPlanFromTier(id),
    })
  },

  async reload() {
    this.setData({ loading: true, payErr: '' })
    if (devAuth.isDevSkipLogin()) {
      this.setData({
        loading: false,
        planLabel: '专业版',
        displayPlanLabel: '专业版',
        isPaid: true,
        expireText: '2026-12-31',
        walletBalanceCents: 25160,
        walletBalanceYuan: '251.60',
        currentTierId: 'pro',
        activeTierId: 'pro',
        featureTable: subUi.buildTable('pro'),
      })
      return
    }
    try {
      const [snap, summary] = await Promise.all([
        membershipMp.loadMembershipSnapshot(),
        billing.fetchTenantBillingSummary(),
      ])
      const ent = snap.ent
      const usage = snap.memberUsage
      let remainDaysDisplay = '0'
      let expireWarn = ''
      if (ent.isPaid) {
        if (usage.remainDays != null && usage.remainDays > 0) {
          remainDaysDisplay = String(usage.remainDays)
        } else if (usage.remainDays === 0) {
          remainDaysDisplay = '0'
          expireWarn = '今日到期，请尽快续费。'
        } else if (usage.remainDays != null && usage.remainDays < 0) {
          remainDaysDisplay = String(Math.abs(usage.remainDays))
          expireWarn = `会员已过期 ${Math.abs(usage.remainDays)} 天，续费后可继续使用。`
        }
      }
      const currentTierId = subUi.planToTierId(ent.plan)
      const displayPlanLabel = subUi.tierLabel(ent.plan)
      const bc = typeof summary.walletBalanceCents === 'number' ? summary.walletBalanceCents : 0
      this.setData({
        loading: false,
        planLabel: summary.membershipPlanLabel || ent.planLabel,
        displayPlanLabel,
        monthlyYuan: ent.monthlyYuan,
        featureLines: ent.featureLines,
        directAiRemaining: ent.directAiRemaining,
        directAiLimit: ent.directAiCallLimit,
        isPaid: ent.isPaid,
        subscriptionDays: snap.subscriptionDays,
        opsGiftDays: snap.opsGiftDays,
        totalEntitlementDays: snap.totalEntitlementDays,
        remainDaysDisplay,
        expireText: usage.expireText ? String(usage.expireText).slice(0, 10) : '',
        expireWarn,
        walletBalanceCents: bc,
        walletBalanceYuan: tiersUtil.formatYuanFromCents(bc),
        currentTierId,
        activeTierId: currentTierId,
        featureTable: subUi.buildTable(currentTierId),
      })
    } catch (e) {
      this.setData({ loading: false, payErr: payFlow.formatPayError(e) })
    }
  },

  onOpenSubscribe() {
    this.stopPayTimers()
    this.setData({
      paySheetOpen: true,
      payErr: '',
      channel: '',
      payStep: 'choose',
      qrUrl: '',
      remainSecText: '05:00',
      polling: false,
    })
  },

  onCloseSubscribe() {
    this.stopPayTimers()
    this.setData({
      paySheetOpen: false,
      payBusy: false,
      payErr: '',
      qrUrl: '',
      polling: false,
    })
  },

  onPickTier(e) {
    this.setData({ tierIndex: Number(e.currentTarget.dataset.index) || 0 })
  },

  onPickChannel(e) {
    this.setData({ channel: e.currentTarget.dataset.ch || '', payErr: '' })
  },

  onBackChoose() {
    this.stopPayTimers()
    this.setData({
      payStep: 'choose',
      channel: '',
      qrUrl: '',
      polling: false,
      payErr: '',
      remainSecText: '05:00',
    })
  },

  async onWalletPaySubscribe() {
    const tier = this.data.subscriptionTiers[this.data.tierIndex]
    if (!tier) {
      this.setData({ payErr: '请选择套餐' })
      return
    }
    const bc = this.data.walletBalanceCents
    if (bc < tier.cents) {
      this.setData({
        payErr: `余额不足，当前可用 ¥${tiersUtil.formatYuanFromCents(bc)}，应付 ¥${tiersUtil.formatYuanFromCents(tier.cents)}`,
      })
      return
    }
    this.setData({ payBusy: true, payErr: '' })
    try {
      await billing.tenantWalletPay({
        orderKind: 'subscription',
        amountCents: tier.cents,
      })
      wx.showToast({ title: '订阅已开通', icon: 'success' })
      this.onCloseSubscribe()
      this.reload()
    } catch (e) {
      this.setData({ payBusy: false, payErr: payFlow.formatPayError(e) })
    }
  },

  async onSubmitPay() {
    const tier = this.data.subscriptionTiers[this.data.tierIndex]
    const ch = this.data.channel
    if (!tier || !ch) {
      this.setData({ payErr: '请选择套餐与支付方式' })
      return
    }
    this.setData({ payBusy: true, payErr: '' })
    try {
      const result = await payFlow.startOnlinePay({
        orderKind: 'subscription',
        amountCents: tier.cents,
        channel: ch,
      })
      if (ch === 'wechat') {
        wx.showToast({ title: '支付成功，权益已到账', icon: 'success' })
        this.onCloseSubscribe()
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
          this.onCloseSubscribe()
          wx.showToast({ title: '支付已超时', icon: 'none' })
        },
      )
      payFlow
        .pollPayUntilDone(result.outTradeNo)
        .then(() => {
          this.stopPayTimers()
          wx.showToast({ title: '支付成功，权益已到账', icon: 'success' })
          this.onCloseSubscribe()
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
