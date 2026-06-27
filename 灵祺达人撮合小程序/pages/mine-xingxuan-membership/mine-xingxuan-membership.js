const userProfile = require('../../utils/userProfile.js')
const memberStore = require('../../utils/talentMember.js')
const auth = require('../../utils/auth.js')
const catalog = require('../../utils/mpMembershipCatalogMp.js')
const mpFeatures = require('../../utils/mpMembershipFeaturesMp.js')
const { mergePlanPermissions } = require('../../utils/mpMembershipMatrixBuiltin.js')
const mpMembershipUi = require('../../utils/mpMembershipUi.js')
const mpMembershipApi = require('../../utils/mpMembershipApi.js')
const registryProfileSync = require('../../utils/registryProfileSync.js')
const { prepareXingxuanSubPage } = require('../../utils/pageIdentityChrome.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')

const PLAN_TAB_ORDER = ['basic', 'pro', 'flagship', 'enterprise']
const PLAN_TAB_SHORT = {
  basic: '基础版',
  pro: '专业版',
  flagship: '旗舰版',
  enterprise: '企业版',
}

function buildPlanTabs(plans) {
  const byId = {}
  ;(plans || []).forEach((p) => {
    byId[p.id] = p
  })
  return PLAN_TAB_ORDER.filter((id) => byId[id]).map((id) => ({
    id,
    shortLabel: PLAN_TAB_SHORT[id] || byId[id].name,
  }))
}

function pickSelectedPlan(plans, selectedPlanId) {
  const list = plans || []
  const id = String(selectedPlanId || '').trim()
  return list.find((p) => p.id === id) || list[0] || null
}

function mapPlanRow(plan, role) {
  const price = catalog.formatPrice(plan)
  const id = String(plan.id || 'basic').trim() || 'basic'
  const mergedPlan = { ...plan, permissions: mergePlanPermissions(role, plan) }
  return {
    id,
    name: plan.name || mpMembershipUi.planLabel(id),
    tagline: catalog.taglineFor(role, id),
    priceMain: price.main,
    priceSub: price.sub,
    isFree: price.isFree,
    isRecommended: id === 'pro',
    priceMonthlyYuan: plan.priceMonthlyYuan,
    priceYearlyYuan: plan.priceYearlyYuan,
    featureGroups: mpFeatures.buildPlanFeatureGroups(role, mergedPlan),
  }
}

Page({
  data: {
    lqThemeClass: 'lq-theme-pr',
    pageTitle: '星选会员',
    pageSubtitle: '',
    loading: true,
    err: '',
    plans: [],
    planTabs: [],
    selectedPlanId: 'basic',
    selectedPlan: null,
    currentPlanId: 'basic',
    currentPlanLabel: '基础版（免费）',
    currentExpiryLabel: '',
    activeBenefits: [],
    showPaySheet: false,
    payPlanId: '',
    payPlanName: '',
    payAmountYuan: '—',
    billing: 'monthly',
    canYearly: false,
    payBusy: false,
    payErr: '',
    payDoneMsg: '',
    outTradeNo: '',
    payDevtoolsHint: '',
  },
  onLoad() {
    const identity = userProfile.readIdentity()
    const meta = catalog.pageMeta(mpMembershipUi.workRoleFromIdentity(identity))
    this.setData({
      pageTitle: meta.title,
      pageSubtitle: meta.subtitle,
    })
  },
  async onShow() {
    const ok = await prepareXingxuanSubPage(this)
    if (!ok) {
      guestRoutes.redirectToLogin('/pages/mine-xingxuan-membership/mine-xingxuan-membership')
      return
    }
    await this.reload()
  },
  async reload() {
    const identity = userProfile.readIdentity()
    const role = mpMembershipUi.workRoleFromIdentity(identity)
    const acct = auth.readAccount()
    const member = memberStore.readMember()
    const prProfile = userProfile.readPrProfile()
    const planId = mpMembershipUi.readMembershipPlanId(acct, identity, member, prProfile)
    const expiresAt = mpMembershipUi.readMembershipExpiresAt(acct, identity, member, prProfile)
    this.setData({
      loading: true,
      err: '',
      currentPlanId: planId,
      currentPlanLabel: mpMembershipUi.planLabel(planId),
      currentExpiryLabel:
        planId === 'basic'
          ? '永久免费'
          : mpMembershipUi.formatExpiryLabel(planId, expiresAt) || '未记录',
    })
    try {
      const versions = await mpMembershipApi.fetchMembershipPlanVersions(role)
      const plans = versions.map((p) => mapPlanRow(p, role))
      const currentPlan = versions.find((p) => String(p.id) === planId) || versions[0]
      const activeBenefits = currentPlan
        ? mpFeatures.listEnabledFeatures(role, {
            ...currentPlan,
            permissions: mergePlanPermissions(role, currentPlan),
          })
        : []
      const planTabs = buildPlanTabs(plans)
      const selectedPlanId =
        (this.data.selectedPlanId && plans.some((p) => p.id === this.data.selectedPlanId)
          ? this.data.selectedPlanId
          : planId) || 'basic'
      const selectedPlan = pickSelectedPlan(plans, selectedPlanId)
      this.setData({
        plans,
        planTabs,
        selectedPlanId,
        selectedPlan,
        activeBenefits,
        loading: false,
      })
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e),
      })
    }
  },
  onGoMyOrders() {
    wx.navigateTo({ url: '/pages/mine-my-orders/mine-my-orders?tab=membership' })
  },
  onSelectPlan(e) {
    const id = String(e.currentTarget.dataset.id || '').trim()
    if (!id || id === this.data.selectedPlanId) return
    const selectedPlan = pickSelectedPlan(this.data.plans, id)
    if (!selectedPlan) return
    this.setData({ selectedPlanId: id, selectedPlan })
  },
  onGoMyOrdersAfterPay() {
    const out = String(this.data.outTradeNo || '').trim()
    const q = out ? `?tab=membership&outTradeNo=${encodeURIComponent(out)}` : '?tab=membership'
    this.setData({ showPaySheet: false })
    wx.navigateTo({ url: `/pages/mine-my-orders/mine-my-orders${q}` })
  },
  onOpenPay(e) {
    const id = String(e.currentTarget.dataset.id || '').trim()
    const plan = (this.data.plans || []).find((p) => p.id === id)
    if (!plan || plan.isFree) return
    const billing = 'monthly'
    const amount =
      billing === 'yearly' ? plan.priceYearlyYuan : plan.priceMonthlyYuan
    this.setData({
      showPaySheet: true,
      payPlanId: plan.id,
      payPlanName: plan.name,
      billing,
      canYearly: plan.priceYearlyYuan != null && plan.priceYearlyYuan > 0,
      payAmountYuan: amount != null && amount > 0 ? String(amount) : '—',
      payErr: '',
      payDoneMsg: '',
      outTradeNo: '',
      payDevtoolsHint: mpMembershipApi.isWechatPayDevtoolsQrMode()
        ? '开发者工具会弹出扫码调试；真机预览/体验版将直接调起微信支付密码框。'
        : '',
    })
  },
  onPickBilling(e) {
    const billing = e.currentTarget.dataset.billing === 'yearly' ? 'yearly' : 'monthly'
    const plan = (this.data.plans || []).find((p) => p.id === this.data.payPlanId)
    if (!plan) return
    const amount = billing === 'yearly' ? plan.priceYearlyYuan : plan.priceMonthlyYuan
    this.setData({
      billing,
      payAmountYuan: amount != null && amount > 0 ? String(amount) : '—',
    })
  },
  onClosePay() {
    if (this.data.payBusy) return
    this.setData({ showPaySheet: false })
  },
  noop() {},
  async onConfirmPay() {
    if (this.data.payBusy) return
    const identity = userProfile.readIdentity()
    const role = mpMembershipUi.workRoleFromIdentity(identity)
    const planId = this.data.payPlanId
    const billing = this.data.billing
    if (!planId) return
    this.setData({ payBusy: true, payErr: '' })
    try {
      const prepay = await mpMembershipApi.createWechatJsapiPrepay({
        workRole: role,
        planId,
        billing,
      })
      await mpMembershipApi.requestWxPayment(prepay.jsapiParams)
      const poll = await mpMembershipApi.pollUntilPaid(prepay.outTradeNo)
      try {
        await registryProfileSync.pullRegistryProfileAfterLogin()
      } catch (_) {}
      this.setData({
        payDoneMsg: poll.message || '支付成功，会员已开通。',
        outTradeNo: prepay.outTradeNo,
      })
      await this.reload()
    } catch (e) {
      const msg = String(e && e.errMsg ? e.errMsg : e && e.message ? e.message : e)
      if (/cancel/i.test(msg)) {
        this.setData({ payErr: '已取消支付' })
      } else {
        this.setData({ payErr: msg.slice(0, 80) })
      }
    } finally {
      this.setData({ payBusy: false })
    }
  },
})
