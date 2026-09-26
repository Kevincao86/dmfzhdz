const auth = require('../../../utils/auth.js')
const ecs = require('../../../utils/ecs.js')
const sessionStore = require('../../../utils/mpSessionStore.js')
const mpBillingRoleHint = require('../../../utils/mpBillingRoleHint.js')
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
  async load() {
    this.setData({ loading: true, err: '' })
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
      const depositPaid = await training.syncDeposit()
      this.setData({
        loading: false,
        balanceLabel: balance.toLocaleString('zh-CN'),
        depositPaid,
      })
    } catch (e) {
      this.setData({ loading: false, err: String((e && e.message) || '加载失败').slice(0, 24) })
    }
  },
  onPoints() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-points-recharge/mine-xingxuan-points-recharge' })
  },
  onSettle() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-settle/mine-training-settle' })
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
