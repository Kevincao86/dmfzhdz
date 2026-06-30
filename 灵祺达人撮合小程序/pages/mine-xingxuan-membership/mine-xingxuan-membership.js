const userProfile = require('../../utils/userProfile.js')
const memberStore = require('../../utils/talentMember.js')
const auth = require('../../utils/auth.js')
const catalog = require('../../utils/mpMembershipCatalogMp.js')
const mpFeatures = require('../../utils/mpMembershipFeaturesMp.js')
const { mergePlanPermissions } = require('../../utils/mpMembershipMatrixBuiltin.js')
const mpMembershipUi = require('../../utils/mpMembershipUi.js')
const mpMembershipApi = require('../../utils/mpMembershipApi.js')
const registryProfileSync = require('../../utils/registryProfileSync.js')
const { prepareMineSubPage } = require('../../utils/pageIdentityChrome.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const mpCdnAssets = require('../../utils/mpCdnAssets.js')

const PLAN_TAB_ORDER = ['basic', 'pro', 'flagship', 'enterprise']
const PLAN_TAB_SHORT = {
  basic: '基础版',
  pro: '专业版',
  flagship: '旗舰版',
  enterprise: '企业版',
}
const PLAN_TAB_BADGE = {
  basic: '免费',
  pro: '推荐',
  flagship: '热门',
  enterprise: '定制',
}

const HERO_SUBTITLE = {
  talent: '解锁更多权益，助力高效接单与变现',
  pr: '解锁更多权益，助力高效发单与达人撮合',
  shoot: '解锁更多权益，助力团队接单与协作展示',
  edit: '解锁更多权益，助力云剪接单与高效交付',
}

const IDENTITY_ILLUSTRATION = {
  talent: mpCdnAssets.membershipHero('talent'),
  pr: mpCdnAssets.membershipHero('pr'),
  shoot: mpCdnAssets.membershipHero('shoot'),
  edit: mpCdnAssets.membershipHero('edit'),
}

const GROUP_VISUAL = {
  talent: {
    找单报名: { icon: '🔍', tone: 'blue', desc: '发现更多通告机会' },
    履约交片: { icon: '🎬', tone: 'green', desc: '高效完成交付' },
    'AI 审核': { icon: '✨', tone: 'purple', desc: '智能检测作品质量' },
    'AI 增值': { icon: '🚀', tone: 'orange', desc: 'AI 助力创作与曝光' },
    团队: { icon: '👥', tone: 'slate', desc: '团队席位与优先服务' },
  },
  pr: {
    撮合发单: { icon: '📣', tone: 'purple', desc: '发招募与定向撮合' },
    履约闭环: { icon: '🔄', tone: 'green', desc: '反选审片完整闭环' },
    达人库: { icon: '👥', tone: 'blue', desc: '达人库与智能推荐' },
    'AI 增值': { icon: '🚀', tone: 'orange', desc: '短视频与数字人增值' },
    团队: { icon: '🏢', tone: 'slate', desc: '多席位与 API 对接' },
  },
  shoot: {
    接单展示: { icon: '📷', tone: 'blue', desc: '拍摄商单与档期展示' },
    'AI 增值': { icon: '🚀', tone: 'orange', desc: '脚本与分镜 AI 辅助' },
    团队: { icon: '👥', tone: 'slate', desc: '多机位与团队席位' },
  },
  edit: {
    接单展示: { icon: '✂️', tone: 'teal', desc: '剪辑与云剪任务接单' },
    'AI 增值': { icon: '🚀', tone: 'orange', desc: '云剪 AI 与文案辅助' },
    团队: { icon: '👥', tone: 'slate', desc: '多席位与优先客服' },
  },
}

function buildPlanTabs(plans) {
  const byId = {}
  ;(plans || []).forEach((p) => {
    byId[p.id] = p
  })
  return PLAN_TAB_ORDER.filter((id) => byId[id]).map((id) => ({
    id,
    shortLabel: PLAN_TAB_SHORT[id] || byId[id].name,
    badge: PLAN_TAB_BADGE[id] || '',
  }))
}

function pickSelectedPlan(plans, selectedPlanId) {
  const list = plans || []
  const id = String(selectedPlanId || '').trim()
  return list.find((p) => p.id === id) || list[0] || null
}

function enrichFeatureGroups(role, groups) {
  const visual = GROUP_VISUAL[role] || GROUP_VISUAL.talent
  return (groups || [])
    .map((g) => {
      const meta = visual[g.title] || { icon: '📌', tone: 'blue', desc: '' }
      const items = (g.items || []).filter((i) => i.icon !== 'no')
      return {
        ...g,
        icon: meta.icon,
        tone: meta.tone,
        desc: meta.desc,
        items,
      }
    })
    .filter((g) => g.items.length > 0)
}

function buildActiveBenefitCards(role, plan) {
  const merged = {
    ...plan,
    permissions: mergePlanPermissions(role, plan),
  }
  const groups = mpFeatures.buildPlanFeatureGroups(role, merged)
  const cards = []
  for (const g of groups) {
    const enabled = (g.items || []).filter((i) => i.icon !== 'no')
    if (!enabled.length) continue
    const lead = enabled[0]
    const descParts = enabled.slice(0, 2).map((i) => (i.detail ? `${i.label} · ${i.detail}` : i.label))
    cards.push({
      key: `${g.title}-${lead.key}`,
      title: lead.label,
      desc: descParts.join('；') || g.title,
    })
    if (cards.length >= 4) break
  }
  if (cards.length >= 4) return cards
  const extras = mpFeatures.listEnabledFeatures(role, merged)
  for (const item of extras) {
    if (cards.some((c) => c.key === item.key)) continue
    cards.push({
      key: item.key,
      title: item.label,
      desc: item.detail ? `${item.detail}` : item.group || '',
    })
    if (cards.length >= 4) break
  }
  return cards
}

function mapPlanRow(plan, role, billing, nowMs) {
  const price = catalog.formatPrice(plan, billing, nowMs)
  const id = String(plan.id || 'basic').trim() || 'basic'
  const mergedPlan = { ...plan, permissions: mergePlanPermissions(role, plan) }
  return {
    id,
    name: plan.name || mpMembershipUi.planLabel(id),
    tagline: catalog.taglineFor(role, id),
    priceMain: price.main,
    priceSub: price.sub,
    listMain: price.listMain || '',
    discountLabel: price.discountLabel || '',
    promoCountdown: price.promoCountdown || '',
    promoActive: !!price.promoActive,
    isFree: price.isFree,
    isRecommended: id === 'pro',
    priceMonthlyYuan: plan.priceMonthlyYuan,
    priceYearlyYuan: plan.priceYearlyYuan,
    _raw: plan,
    featureGroups: enrichFeatureGroups(role, mpFeatures.buildPlanFeatureGroups(role, mergedPlan)),
  }
}

Page({
  data: {
    lqThemeClass: 'lq-theme-talent',
    pageTitle: '星选会员',
    pageSubtitle: '',
    identityIllustration: IDENTITY_ILLUSTRATION.talent,
    loading: true,
    err: '',
    plans: [],
    planTabs: [],
    selectedPlanId: 'basic',
    selectedPlan: null,
    currentPlanId: 'basic',
    currentPlanLabel: '基础版（免费）',
    currentExpiryLabel: '',
    activeBenefitCards: [],
    planTabUserPick: false,
    scrollIntoView: '',
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
    planVersionsRaw: [],
    workRole: 'talent',
  },
  _promoTimer: null,
  onUnload() {
    if (this._promoTimer) clearInterval(this._promoTimer)
  },
  startPromoTimer() {
    if (this._promoTimer) clearInterval(this._promoTimer)
    this._promoTimer = setInterval(() => this.tickPromoCountdown(), 1000)
  },
  tickPromoCountdown() {
    const raw = this.data.planVersionsRaw || []
    if (!raw.some((p) => catalog.hasPromoCountdown(p))) return
    const role = this.data.workRole || 'talent'
    const plans = raw.map((p) => mapPlanRow(p, role, 'monthly'))
    const selectedPlan = pickSelectedPlan(plans, this.data.selectedPlanId)
    this.setData({ plans, selectedPlan })
  },
  onLoad() {
    const identity = userProfile.readIdentity()
    const role = mpMembershipUi.workRoleFromIdentity(identity)
    const meta = catalog.pageMeta(role)
    this.setData({
      pageTitle: meta.title,
      pageSubtitle: HERO_SUBTITLE[role] || meta.subtitle,
      identityIllustration: IDENTITY_ILLUSTRATION[role] || IDENTITY_ILLUSTRATION.talent,
    })
  },
  async onShow() {
    const ok = await prepareMineSubPage(this)
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
      const plans = versions.map((p) => mapPlanRow(p, role, 'monthly'))
      const currentPlan = versions.find((p) => String(p.id) === planId) || versions[0]
      const activeBenefitCards = currentPlan ? buildActiveBenefitCards(role, currentPlan) : []
      const planTabs = buildPlanTabs(plans)
      const selectedPlanId = this.data.planTabUserPick
        ? this.data.selectedPlanId && plans.some((p) => p.id === this.data.selectedPlanId)
          ? this.data.selectedPlanId
          : planId
        : planId
      const selectedPlan = pickSelectedPlan(plans, selectedPlanId)
      this.setData({
        plans,
        planVersionsRaw: versions,
        workRole: role,
        planTabs,
        selectedPlanId,
        selectedPlan,
        activeBenefitCards,
        loading: false,
      })
      this.startPromoTimer()
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
  onCompareBenefits() {
    this.setData({ scrollIntoView: 'xx-plan-tabs', planTabUserPick: true })
    wx.showToast({ title: '切换档位查看权益', icon: 'none', duration: 1800 })
  },
  onSelectPlan(e) {
    const id = String(e.currentTarget.dataset.id || '').trim()
    if (!id || id === this.data.selectedPlanId) return
    const selectedPlan = pickSelectedPlan(this.data.plans, id)
    if (!selectedPlan) return
    this.setData({ selectedPlanId: id, selectedPlan, planTabUserPick: true })
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
    const raw = plan._raw || plan
    const amount = catalog.effectivePayYuan(raw, billing)
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
    const raw = plan._raw || plan
    const amount = catalog.effectivePayYuan(raw, billing)
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
        planTabUserPick: false,
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
