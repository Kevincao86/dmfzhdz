const auth = require('../../../utils/auth.js')
const userProfile = require('../../../utils/userProfile.js')
const mpMembershipApi = require('../../../utils/mpMembershipApi.js')
const mpMembershipUi = require('../../../utils/mpMembershipUi.js')
const registryProfileSync = require('../../../utils/registryProfileSync.js')
const mpBillingRoleHint = require('../../../utils/mpBillingRoleHint.js')
const ecs = require('../../../utils/ecs.js')
const sessionStore = require('../../../utils/mpSessionStore.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')
const guestRoutes = require('../../../utils/mpGuestRoutes.js')

const TIERS = [
  { yuan: 10, points: 500, label: '体验包' },
  { yuan: 45, points: 2500, label: '标准包', listPriceYuan: 50 },
  { yuan: 88, points: 5000, label: '进阶包', listPriceYuan: 100 },
  { yuan: 438, points: 25000, label: '团队包', listPriceYuan: 500 },
].map((t) => ({
  ...t,
  pointsText: `${t.points.toLocaleString('zh-CN')} 积分`,
  yuanText: String(t.yuan),
  listPriceYuanText: t.listPriceYuan ? String(t.listPriceYuan) : '',
  hasDiscount: Boolean(t.listPriceYuan && t.listPriceYuan > t.yuan),
}))

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    loading: true,
    err: '',
    balance: 0,
    balanceLabel: '0',
    showQuotaSummary: false,
    monthlyGiftQuotaLabel: '0',
    monthlySpentLabel: '0',
    packageRemainingLabel: '0',
    rechargeBalanceLabel: '0',
    tiers: TIERS,
    showPaySheet: false,
    payPoints: 0,
    payPointsText: '',
    payAmountYuan: '',
    payBusy: false,
    payErr: '',
    payDoneMsg: '',
    outTradeNo: '',
    payDevtoolsHint: '',
  },
  onLoad() {
    prepareMineSubPage(this)
    if (!auth.readSessionToken()) {
      guestRoutes.redirectToLogin('/pages/subpack-mine/mine-xingxuan-points-recharge/mine-xingxuan-points-recharge')
      return
    }
    this.loadBalance()
  },
  async loadBalance() {
    this.setData({ loading: true, err: '' })
    try {
      try {
        await registryProfileSync.pullRegistryProfileAfterLogin()
      } catch (_) {}
      const token = sessionStore.readSessionToken()
      const data = await ecs.post(
        '/api/meoo-ops-mp-auth',
        { action: 'registry_profile_get', ...mpBillingRoleHint.billingRolePayload() },
        { 'X-Mp-Session': token },
      )
      if (!data || data.ok === false) throw new Error(String((data && data.error) || 'load_failed'))
      const s = data.mpAiPointsSummary && typeof data.mpAiPointsSummary === 'object' ? data.mpAiPointsSummary : null
      const packageRemaining = s ? Math.max(0, Math.floor(Number(s.packageRemaining) || 0)) : 0
      const rechargeBalance = s ? Math.max(0, Math.floor(Number(s.rechargeBalance) || 0)) : 0
      // 总余额 = 套餐剩余 + 充值积分（与 summary.balance 对齐，不用滞后的顶层字段）
      const balance = s
        ? Math.max(0, Math.floor(Number(s.balance) || packageRemaining + rechargeBalance))
        : Math.max(0, Math.floor(Number(data.mpAiPointsBalance) || 0))
      this.setData({
        loading: false,
        balance,
        balanceLabel: balance.toLocaleString('zh-CN'),
        monthlyGiftQuota: s ? Math.max(0, Math.floor(Number(s.monthlyGiftQuota) || 0)) : 0,
        monthlyGiftQuotaLabel: s ? Math.max(0, Math.floor(Number(s.monthlyGiftQuota) || 0)).toLocaleString('zh-CN') : '0',
        monthlySpent: s ? Math.max(0, Math.floor(Number(s.monthlySpent) || 0)) : 0,
        monthlySpentLabel: s ? Math.max(0, Math.floor(Number(s.monthlySpent) || 0)).toLocaleString('zh-CN') : '0',
        packageRemaining,
        packageRemainingLabel: packageRemaining.toLocaleString('zh-CN'),
        rechargeBalance,
        rechargeBalanceLabel: rechargeBalance.toLocaleString('zh-CN'),
        showQuotaSummary: Boolean(s),
      })
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e),
      })
    }
  },
  openPaySheet(points, yuan) {
    this.setData({
      showPaySheet: true,
      payPoints: points,
      payPointsText: points.toLocaleString('zh-CN'),
      payAmountYuan: String(yuan),
      payErr: '',
      payDoneMsg: '',
      outTradeNo: '',
      payDevtoolsHint: mpMembershipApi.isWechatPayDevtoolsQrMode()
        ? '开发者工具会弹出扫码调试；真机将直接调起微信支付。'
        : '',
    })
  },
  onPickTier(e) {
    const yuan = Number(e.currentTarget.dataset.yuan)
    const points = Number(e.currentTarget.dataset.points)
    if (!points || !yuan) return
    this.openPaySheet(points, yuan)
  },
  onClosePay() {
    if (this.data.payBusy) return
    this.setData({ showPaySheet: false })
  },
  noop() {},
  onGoMyOrders() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-my-orders/mine-my-orders?tab=points' })
  },
  onGoMyOrdersAfterPay() {
    const out = String(this.data.outTradeNo || '').trim()
    const q = out ? `?tab=points&outTradeNo=${encodeURIComponent(out)}` : '?tab=points'
    this.setData({ showPaySheet: false })
    wx.navigateTo({ url: `/pages/subpack-mine/mine-my-orders/mine-my-orders${q}` })
  },
  async onConfirmPay() {
    if (this.data.payBusy) return
    const identity = userProfile.readIdentity()
    const role = mpMembershipUi.workRoleFromIdentity(identity)
    const points = this.data.payPoints
    if (!points) return
    this.setData({ payBusy: true, payErr: '' })
    try {
      const prepay = await mpMembershipApi.createPointsWechatJsapiPrepay({
        workRole: role,
        points,
      })
      await mpMembershipApi.requestWxPayment(prepay.jsapiParams)
      const poll = await mpMembershipApi.pollPointsUntilPaid(prepay.outTradeNo)
      try {
        await registryProfileSync.pullRegistryProfileAfterLogin()
      } catch (_) {}
      const newBal = poll.newBalance
      this.setData({
        payBusy: false,
        payDoneMsg: poll.message,
        outTradeNo: prepay.outTradeNo,
        balance: newBal != null ? newBal : this.data.balance,
        balanceLabel:
          newBal != null ? newBal.toLocaleString('zh-CN') : this.data.balanceLabel,
      })
      if (newBal == null) this.loadBalance()
    } catch (e) {
      const msg = String(e && e.message ? e.message : e)
      if (/cancel/i.test(msg)) {
        this.setData({ payBusy: false, payErr: '已取消支付' })
        return
      }
      this.setData({ payBusy: false, payErr: msg })
    }
  },
})
