const auth = require('../../../utils/auth.js')
const ecs = require('../../../utils/ecs.js')
const sessionStore = require('../../../utils/mpSessionStore.js')
const mpBillingRoleHint = require('../../../utils/mpBillingRoleHint.js')
const userProfile = require('../../../utils/userProfile.js')
const registryProfileSync = require('../../../utils/registryProfileSync.js')
const training = require('../../../utils/mpTraining.js')
const guestRoutes = require('../../../utils/mpGuestRoutes.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')

Page({
  data: {
    loading: true,
    err: '',
    balanceLabel: '0',
    depositPaid: false,
    yuan: training.DEPOSIT_YUAN,
    netLabel: '0',
    commissionLabel: '0',
    taxLabel: '0',
    accountBound: false,
    payouts: [],
    cashVisible: false,
    cashLoading: false,
    cashTitle: '',
    cashSubtitle: '',
    cashPoster: '',
    cashRules: '',
    cashAvailable: '0.00',
    cashOrders: 0,
    cashRemaining: 0,
    cashCanWithdraw: false,
    cashHint: '',
    cashWithdraws: [],
  },
  onLoad() {
    prepareMineSubPage(this)
    if (!auth.readSessionToken()) {
      guestRoutes.redirectToLogin('/pages/subpack-mine/mine-wallet/mine-wallet')
      return
    }
  },
  onShow() {
    if (auth.readSessionToken()) this.load()
  },
  cashFallbackTitle(workIdentity) {
    return workIdentity === 'talent' ? '达人活动红包提现' : 'PR招募现金红包'
  },
  showCashShell(workIdentity) {
    return workIdentity === 'pr' || workIdentity === 'talent'
  },
  loadCash(workIdentity, seq) {
    const token = sessionStore.readSessionToken()
    return ecs
      .post(
        '/api/meoo-mp-pr-cash-wallet',
        { action: 'summary', workIdentity },
        { 'X-Mp-Session': token },
      )
      .then((cash) => {
        if (seq !== this._cashSeq) return
        if (!cash || cash.visible === false) {
          this.setData({ cashVisible: false, cashLoading: false })
          return
        }
        const cashCampaign = cash.campaign || {}
        const cashWallet = cash.wallet || {}
        this.setData({
          cashVisible: true,
          cashLoading: false,
          cashTitle: cashCampaign.title || this.cashFallbackTitle(workIdentity),
          cashSubtitle: cashCampaign.subtitle || '',
          cashPoster: cashCampaign.posterUrl || '',
          cashRules: cashCampaign.rulesText || '',
          cashAvailable: cashWallet.availableYuan || '0.00',
          cashOrders: cashWallet.qualifyingOrders || 0,
          cashRemaining: cashCampaign.remaining || 0,
          cashCanWithdraw: !!cashWallet.canWithdraw,
          cashHint: cashWallet.hint || '',
          cashWithdraws: cash.withdraws || [],
        })
      })
      .catch(() => {
        if (seq !== this._cashSeq) return
        this.setData({
          cashVisible: true,
          cashLoading: false,
          cashHint: '暂时读不到红包，下拉再试',
        })
      })
  },
  async load() {
    const workIdentity = userProfile.readIdentity()
    const showCash = this.showCashShell(workIdentity)
    this._cashSeq = (this._cashSeq || 0) + 1
    const cashSeq = this._cashSeq
    this.setData({
      loading: true,
      err: '',
      cashVisible: showCash,
      cashLoading: showCash,
      cashTitle: showCash ? this.data.cashTitle || this.cashFallbackTitle(workIdentity) : '',
    })
    if (showCash) this.loadCash(workIdentity, cashSeq)
    try {
      try { await registryProfileSync.pullRegistryProfileAfterLogin() } catch (_) {}
      const token = sessionStore.readSessionToken()
      const data = await ecs.post(
        '/api/meoo-ops-mp-auth',
        { action: 'registry_profile_get', ...mpBillingRoleHint.billingRolePayload() },
        { 'X-Mp-Session': token },
      )
      const s = data && data.mpAiPointsSummary && typeof data.mpAiPointsSummary === 'object' ? data.mpAiPointsSummary : null
      const packageRemaining = s ? Math.max(0, Math.floor(Number(s.packageRemaining) || 0)) : 0
      const rechargeBalance = s ? Math.max(0, Math.floor(Number(s.rechargeBalance) || 0)) : 0
      const balance = s
        ? Math.max(0, Math.floor(Number(s.balance) || packageRemaining + rechargeBalance))
        : Math.max(0, Math.floor(Number(data && data.mpAiPointsBalance) || 0))
      const summary = await training.walletSummary()
      const profile = await training.syncProfile()
      const quote = summary.settlement || {}
      this.setData({
        loading: false,
        balanceLabel: balance.toLocaleString('zh-CN'),
        depositPaid: summary.depositPaid,
        accountBound: !!(profile && profile.name && profile.bankNo),
        netLabel: Number(quote.net || 0).toFixed(2),
        commissionLabel: Number(quote.commission || 0).toFixed(2),
        taxLabel: Number(quote.tax || 0).toFixed(2),
        payouts: (summary.payouts || []).map((row) => ({
          id: row.id,
          net: Number(row.net || 0).toFixed(2),
          status: row.status === 'paid' ? 'paid' : 'pending',
          statusText: row.status === 'paid' ? '提现成功' : '待打款',
          createdAt: String(row.createdAt || '').slice(0, 16).replace('T', ' '),
          paidAt: row.paidAt ? String(row.paidAt).slice(0, 16).replace('T', ' ') : '',
        })),
      })
    } catch (e) {
      this.setData({ loading: false, err: String((e && e.message) || '加载失败').slice(0, 24) })
    }
  },
  onPoints() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-points-recharge/mine-xingxuan-points-recharge' })
  },
  onBindAccount() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account?mode=payout' })
  },
  onSettle() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-settle/mine-training-settle' })
  },
  onRefund() {
    wx.showModal({
      title: '退回保证金',
      content: '退款后讲师变为未认证，不能发布课程。保证金按原支付方式退回。',
      confirmText: '确认退款',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await training.refundDeposit()
          wx.showToast({ title: '已退款', icon: 'success' })
          this.load()
        } catch (e) {
          wx.showToast({ title: String((e && e.message) || '退款失败').slice(0, 18), icon: 'none' })
        }
      },
    })
  },
  onCashWithdraw() {
    if (!this.data.accountBound) {
      this.onBindAccount()
      return
    }
    if (this.data.cashLoading) {
      wx.showToast({ title: '正在读取红包', icon: 'none' })
      return
    }
    if (!this.data.cashCanWithdraw) {
      wx.showToast({ title: String(this.data.cashHint || '暂时不能提现').slice(0, 18), icon: 'none' })
      return
    }
    wx.showModal({
      title: userProfile.readIdentity() === 'talent' ? '提现活动红包' : '提现招募红包',
      content: `可提现 ¥${this.data.cashAvailable}。提交后等待打款，1–3 个工作日到账。`,
      confirmText: '确认提现',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const token = sessionStore.readSessionToken()
          const data = await ecs.post(
            '/api/meoo-mp-pr-cash-wallet',
            { action: 'withdraw', workIdentity: userProfile.readIdentity() },
            { 'X-Mp-Session': token },
          )
          if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '提现失败')
          wx.showToast({ title: '已提交', icon: 'success' })
          this.load()
        } catch (e) {
          wx.showToast({ title: String((e && e.message) || '提现失败').slice(0, 18), icon: 'none' })
        }
      },
    })
  },
  onWithdraw() {
    if (!this.data.accountBound) {
      this.onBindAccount()
      return
    }
    wx.showModal({
      title: '提现到绑定账户',
      content: `可提现 ¥${this.data.netLabel}（已扣佣金 ¥${this.data.commissionLabel}、个税 ¥${this.data.taxLabel}）。每笔结算只能提现 1 次。每天 00:00–23:59 可发起，提交后 1–3 个工作日到账。`,
      confirmText: '确认提现',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const result = await training.withdrawSettlement()
          const tail = result.bankTail ? `尾号${result.bankTail}` : '绑定账户'
          wx.showToast({ title: `已提现至${tail}`, icon: 'none' })
          this.load()
        } catch (e) {
          wx.showToast({ title: String((e && e.message) || '提现失败').slice(0, 18), icon: 'none' })
        }
      },
    })
  },
  onOrders() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-my-orders/mine-my-orders' })
  },
  async onPayDeposit() {
    if (this._paying) return
    this._paying = true
    wx.showLoading({ title: '拉起微信支付', mask: true })
    try {
      const pre = await training.prepay({ purpose: 'deposit' })
      const payApi = require('../../../utils/mpMembershipApi.js')
      await payApi.requestWxPayment(pre.jsapiParams)
      const q = await training.payQuery(pre.outTradeNo)
      wx.hideLoading()
      if (!q.paid) throw new Error('支付结果确认中，请稍后下拉刷新')
      this.setData({ depositPaid: true })
      wx.showToast({ title: '保证金已支付', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      const msg = String((e && e.message) || '支付未完成')
      if (!/cancel|取消/i.test(msg)) wx.showToast({ title: msg.slice(0, 18), icon: 'none' })
    } finally {
      this._paying = false
    }
  },
})
