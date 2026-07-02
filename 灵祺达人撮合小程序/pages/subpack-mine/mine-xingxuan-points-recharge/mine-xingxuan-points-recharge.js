const auth = require('../../../utils/auth.js')
const userProfile = require('../../../utils/userProfile.js')
const mpMembershipApi = require('../../../utils/mpMembershipApi.js')
const mpMembershipUi = require('../../../utils/mpMembershipUi.js')
const registryProfileSync = require('../../../utils/registryProfileSync.js')
const ecs = require('../../../utils/ecs.js')
const sessionStore = require('../../../utils/mpSessionStore.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')
const guestRoutes = require('../../../utils/mpGuestRoutes.js')

const RECHARGE_POINTS_PER_YUAN = 50

const TIERS = [
  { yuan: 10, points: 500, label: '体验包' },
  { yuan: 50, points: 2500, label: '标准包' },
  { yuan: 100, points: 5000, label: '进阶包' },
  { yuan: 500, points: 25000, label: '团队包' },
].map((t) => ({
  ...t,
  pointsText: `${t.points.toLocaleString('zh-CN')} 积分`,
}))

function computePointsFromYuan(yuan) {
  const y = Math.floor(Number(yuan) || 0)
  if (y < 1) return 0
  return y * RECHARGE_POINTS_PER_YUAN
}

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    loading: true,
    err: '',
    balance: 0,
    balanceLabel: '0',
    tiers: TIERS,
    customYuan: '',
    customPoints: 0,
    customPointsHint: '—',
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
      const token = sessionStore.readSessionToken()
      const data = await ecs.post(
        '/api/meoo-ops-mp-auth',
        { action: 'registry_profile_get' },
        { 'X-Mp-Session': token },
      )
      if (!data || data.ok === false) throw new Error(String((data && data.error) || 'load_failed'))
      const balance = Math.max(0, Math.floor(Number(data.mpAiPointsBalance) || 0))
      this.setData({
        loading: false,
        balance,
        balanceLabel: balance.toLocaleString('zh-CN'),
      })
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e),
      })
    }
  },
  onCustomInput(e) {
    const customYuan = String((e.detail && e.detail.value) || '').replace(/[^\d]/g, '')
    const customPoints = computePointsFromYuan(customYuan)
    this.setData({
      customYuan,
      customPoints,
      customPointsHint:
        customPoints > 0 ? `可得 ${customPoints.toLocaleString('zh-CN')} 积分` : '—',
    })
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
  onCustomPay() {
    const points = this.data.customPoints
    const yuan = Math.floor(Number(this.data.customYuan) || 0)
    if (!points || yuan < 1) {
      wx.showToast({ title: '请输入不少于 ¥1 的整数', icon: 'none' })
      return
    }
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
